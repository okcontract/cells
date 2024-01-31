import { Graph, ReferencesLeft } from "@okcontract/graph";

import {
  type AnyCell,
  Canceled,
  Cell,
  CellErrors,
  type CellResult,
  MapCell,
  type Pending,
  ValueCell,
  Working,
  cancelComputation
} from "./cell";
import { dispatch, dispatchPromiseOrValueArray } from "./promise";
import { SheetProxy } from "./proxy";
import type { AnyCellArray } from "./types";
import { intersection } from "./utils";

type Computations<V> = (
  | Pending<V | Canceled, true>
  | CellResult<V | Canceled, true>
)[];
type IterationResult<V> = {
  computations: Computations<V>;
  updated: Set<number>;
  done: Set<number>;
  canceled: Set<number>;
  greyUpdatedPointers: Set<number>;
  greenPointers: number[];
};

type updateRecResult<V> = {
  roots: Set<number>;
  computations: Computations<V>;
  done: Set<number>;
  canceled: Set<number>;
};
/** sheet count name */
const count = Symbol();
const size = Symbol();
/**
 * Sheet are a set of Cells.
 *
 * @example const sheet = new Sheet()
 *          const cell = sheet.new(...)
 *          const another = sheet.map([cell], fn)
 * @todo Ensure that if to update are triggered concurrently from two different cells,
 *       the final state of cells that depend on the is coherent.
 */

export class Sheet {
  /**
   * for debugging
   */
  private _debug = false;
  private _logList: number[] = [];
  private _autoWatch: string[] = [];

  private _cells: { [key: number]: AnyCell<unknown> };

  /** g is a dependency graph
   *  an arrow from a to b means that
   *  b computes its value using a:
   *  b depends on a.
   *
   */
  private g: Graph<number>;

  /** _pointers is a pointers dependency graph
   *  an arrow from a to b means that
   *  b value is a:
   *  b points to a.
   *
   */
  private _pointers: Graph<number>;
  /** equality function */
  public equals: <V>(prev: V, next: V) => boolean;
  readonly _marshaller: <V>(a: V) => string;
  /**
   * list of ongoing computations
   * @todo compact _computations when there are many updates and long computations
   **/
  /** Cell holding the state of current ongoing computation */
  public working: Working;

  /** Cell holding all the current "initial" errors of the sheet */
  public errors: CellErrors;

  /** Cells that can be garbage collected */
  private _gc: Set<number>;

  /**
   * @param equality function comparing a new value with previous value for updates
   */
  constructor(
    equality = <T>(a: T, b: T) => a === b,
    marshaller = <T>(a: T): string => JSON.stringify(a)
  ) {
    this.g = new Graph();
    this._cells = {};
    this._pointers = new Graph();
    // this.order = [];
    this[count] = 0;
    this[size] = 0;
    this.equals = equality;
    this._marshaller = marshaller;

    this.working = new Working();

    this.errors = new CellErrors();
    this._gc = new Set();
  }

  bless(id: number, name: string) {
    this.g.bless(id, name);
  }

  name(id: number): string {
    return this.g.name(id) || id.toString();
  }
  /**
   * Promise that keeps pending until all computations that were running at call-time are settled.
   */
  async wait(): Promise<void> {
    return this.working.wait();
  }

  /**
   * stats returns statistics about the sheet.
   * @description count is the total cells ever created
   * @size is the current number of cells in the sheet
   */
  get stats() {
    return { count: this[count], size: this[size] };
  }

  /**
   * newProxy creates a new proxy for this sheet.
   * @returns
   */
  newProxy() {
    return new SheetProxy(this);
  }

  /**
   * get a cell.
   * @param id cell
   */
  get(id: number) {
    return this._cells[id];
  }

  /**
   * Remove a former dependency due to pointed value.
   *
   * The actual dependency is only removed if there is direct dependency to the pointed value.
   *
   * @param node the node that depends on the pointer
   * @param pointed the formerly pointed node
   */
  private unsetPointerDep(node: number, pointed: number) {
    if (!this._cells[node].dependencies.includes(pointed)) {
      this._pointers.removeEdge(pointed, node);
    }
  }

  _updatePointer(
    from: number,
    oldPointer: number | undefined,
    to: number | undefined
  ) {
    this._debug &&
      (this._logList.includes(from) ||
        this._logList.includes(oldPointer) ||
        this._logList.includes(to)) &&
      console.log("update pointer", this.naming({ from, oldPointer, to }));
    if (oldPointer !== undefined) this.unsetPointerDep(from, oldPointer);
    if (to !== undefined) this._pointers.addEdge(to, from);
  }

  /** Only public for proxy usage. */
  _addCell<
    V,
    IsComputed extends boolean,
    NF extends boolean,
    T extends Cell<V, IsComputed, NF>
  >(cellBuilder: (id: number) => T): T {
    const id = this[count]++;
    this[size]++;
    this.g.addNode(id);
    this._pointers.addNode(id);
    const cell = cellBuilder(id);
    this._cells[id] = cell;
    return cell;
  }

  /**
   * new adds a new Cell to the Sheet.
   * @param value
   * @param computeFn
   * @param dependencies
   * @returns
   */
  new<V>(
    value: V | Promise<V>,
    proxy?: SheetProxy,
    name?: string, // @todo replace with options
    options?: { name?: string; _storageKey?: string }
  ): ValueCell<V> {
    const cell: ValueCell<V> = this._addCell<V, false, false, ValueCell<V>>(
      (id) =>
        new ValueCell(
          proxy || this,
          id,
          // @todo maybe we should call cell.set(value) if not a Promise?
          value instanceof Promise ? undefined : value,
          options
        )
    );
    this._debug &&
      console.log({
        newInSheet: cell.id,
        name,
        value
      });
    if (value instanceof Promise) {
      this.working.addComputation(
        cell.id,
        // print a message in the console in case of promise rejection
        dispatch(
          cell.set(value),
          (v) => {},
          (error) => {
            console.log(
              `Cell ${cell.id}: promise of value at cell creation as been rejected: ${error}`
            );
            return Promise.reject(error);
          }
        )
      );
    }
    if (name !== undefined) this.bless(cell.id, name);
    // add to debug watch list
    if (this._debug && name) {
      for (const pat of this._autoWatch)
        if (name.toLowerCase().includes(pat)) {
          this._logList.push(cell.id);
          break; // for
        }
    }
    return cell;
  }

  mapRaw<D extends unknown[], V, NF extends boolean = false>(
    dependencies: AnyCellArray<D>,
    computeFn: (...args: D) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    usePreviousValue: boolean,
    name?: string,
    proxy?: SheetProxy | Sheet,
    noFail?: NF
  ): MapCell<V, NF> {
    // getting the containing sheet to register computations
    const containingSheet = proxy || this;
    // check that all dependencies are not deleted
    const missing = dependencies.find((cell) => {
      // console.log({ dependencies, cell });
      return this._cells[cell.id] === undefined;
    });
    if (missing !== undefined) throw new Error(`Deleted cell: ${missing.id}`);
    const mapCell = this._addCell(
      (id) =>
        new MapCell(
          containingSheet,
          id,
          computeFn,
          dependencies,
          usePreviousValue,
          noFail
        )
    );
    if (name) mapCell.bless(name);
    // console.log("Sheet.map:", `registered cell[${id}]`)
    for (const cell of dependencies) this.g.addEdge(cell.id, mapCell.id);
    return mapCell as MapCell<V, NF>;
  }

  // We still need to overload map to fix type inference
  // for variadic kinds.
  map<D1, V, NF extends boolean = false>(
    dependencies: [AnyCell<D1>],
    computeFn: (arg1: D1, prev?: V) => V | Promise<V> | AnyCell<V>,
    name?: string,
    proxy?: SheetProxy | Sheet,
    noFail?: NF
  ): MapCell<V, NF>;
  map<D1, D2, V, NF extends boolean = false>(
    dependencies: [AnyCell<D1>, AnyCell<D2>],
    computeFn: (arg1: D1, arg2: D2, prev?: V) => V | Promise<V> | AnyCell<V>,
    name?: string,
    proxy?: SheetProxy | Sheet,
    noFail?: NF
  ): MapCell<V, NF>;
  map<D1, D2, D3, V, NF extends boolean = false>(
    dependencies: [AnyCell<D1>, AnyCell<D2>, AnyCell<D3>],
    computeFn: (
      arg1: D1,
      arg2: D2,
      arg3: D3,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    proxy?: SheetProxy | Sheet,
    noFail?: NF
  ): MapCell<V, NF>;
  map<D1, D2, D3, D4, V, NF extends boolean = false>(
    dependencies: [AnyCell<D1>, AnyCell<D2>, AnyCell<D3>, AnyCell<D4>],
    computeFn: (
      arg1: D1,
      arg2: D2,
      arg3: D3,
      arg4: D4,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    proxy?: SheetProxy | Sheet,
    noFail?: NF
  ): MapCell<V, NF>;
  map<D1, D2, D3, D4, D5, V, NF extends boolean = false>(
    dependencies: [
      AnyCell<D1>,
      AnyCell<D2>,
      AnyCell<D3>,
      AnyCell<D4>,
      AnyCell<D5>
    ],
    computeFn: (
      arg1: D1,
      arg2: D2,
      arg3: D3,
      arg4: D4,
      arg5: D5,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    proxy?: SheetProxy | Sheet,
    noFail?: NF
  ): MapCell<V, NF>;
  map<D1, D2, D3, D4, D5, D6, V, NF extends boolean = false>(
    dependencies: [
      AnyCell<D1>,
      AnyCell<D2>,
      AnyCell<D3>,
      AnyCell<D4>,
      AnyCell<D5>,
      AnyCell<D6>
    ],
    computeFn: (
      arg1: D1,
      arg2: D2,
      arg3: D3,
      arg4: D4,
      arg5: D5,
      arg6: D6,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    proxy?: SheetProxy | Sheet,
    noFail?: NF
  ): MapCell<V, NF>;
  map<D1, D2, D3, D4, D5, D6, D7, V, NF extends boolean = false>(
    dependencies: [
      AnyCell<D1>,
      AnyCell<D2>,
      AnyCell<D3>,
      AnyCell<D4>,
      AnyCell<D5>,
      AnyCell<D6>,
      AnyCell<D7>
    ],
    computeFn: (
      arg1: D1,
      arg2: D2,
      arg3: D3,
      arg4: D4,
      arg5: D5,
      arg6: D6,
      arg7: D7,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    proxy?: SheetProxy | Sheet,
    noFail?: NF
  ): MapCell<V, NF>;

  map<D extends unknown[], V, NF extends boolean = false>(
    dependencies: AnyCellArray<D>,
    computeFn: (
      ...args: D | [...D, V]
    ) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
    proxy?: SheetProxy | Sheet,
    noFail?: NF
  ): MapCell<V, NF> {
    return this.mapRaw(dependencies, computeFn, true, name, proxy, noFail);
  }

  mapNoPrevious<D extends unknown[], V, NF extends boolean = false>(
    dependencies: AnyCellArray<D>,
    computeFn: (...args: D) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
    proxy?: SheetProxy | Sheet,
    noFail?: NF
  ): MapCell<V, NF> {
    return this.mapRaw(dependencies, computeFn, false, name, proxy, noFail);
  }

  /**
   * Notifies all updated cells.
   * @param up list of updated cells
   */
  private _internalNotify<V>(up: Iterable<number>) {
    for (const i of up) {
      const cell = this._cells[i];
      if (cell !== undefined) {
        cell._notifySubscribers();
      }
    }
  }

  naming(obj) {
    const excludedKeys = ["computationRank"];
    if (!this._debug) return obj;
    const nameOne = (id) => this.name(id);
    const nameComp = (comp: unknown[]) => {
      const newComp = comp
        .map((val, id) => [this.name(id), val])
        .filter((v) => v !== undefined);
      return Object.fromEntries(newComp);
    };
    if (Array.isArray(obj)) {
      return obj.map(nameOne);
    }
    if (obj instanceof Set) {
      return new Set([...obj].map(nameOne));
    }
    if (typeof obj === "number") {
      return nameOne(obj);
    }
    if (obj !== undefined) {
      try {
        const entries = Object.entries(obj).map(([k, v]) => [
          k,
          !excludedKeys.includes(k)
            ? k !== "computations"
              ? this.naming(v)
              : nameComp(v as unknown[])
            : v
        ]);
        return Object.fromEntries(entries);
      } catch (_) {
        return obj;
      }
    } else undefined;
  }
  /**
   * Recompute other updated cells when cells `ids` are updated.
   *
   * All dependent cells are recomputed.
   * As well as cell depending on a pointer who's pointed value has been updated.
   * Once the whole computations are finished,
   * all modified cells and all cells pointing on a modified cell are notified.
   *
   * Triggered computation may change pointers, however they must not introduce cycles
   * in the graph formed by dependencies + pointers
   *
   * @precondition the graph formed by dependencies + pointers should not contain cycles.
   *
   * @param ids : the id of the cells externally modified
   * @returns a promise settled when all cells recomputation are over
   */
  _update<V>(ids: number | number[]) {
    const roots: number[] = Array.isArray(ids) ? ids : [ids];
    if (this._debug) {
      // @todo _watchAll
      const inter = intersection(roots, this._logList);
      console.log(this.naming({ _update: inter }));
    }
    const finished = new Set<number>(roots);
    // @todo add lock mechanism to prevent concurrent updates
    /* @todo Add assertion on expected properties:
     * - if id belongs to safeBorder in one iteration, it will never be recomputed in subsequent iteration
     * - if id belongs to toBeUpdated or Grey at some point, it will eventually belong to safeBorder
     */
    const updateRec: (
      _: updateRecResult<V>
    ) => updateRecResult<V> | Promise<updateRecResult<V>> = ({
      roots,
      computations,
      done,
      canceled
    }) => {
      if (this._debug) {
        // @todo _watchAll
        const inter = this._logList.filter((v) => roots.has(v));
        inter.length &&
          console.log(
            this.naming({ updateRec: roots, done, computations, canceled })
          );
      }
      if (roots.size === 0) {
        return { roots, computations, done, canceled };
      }
      return dispatch(
        this.updateIteration(roots, done, canceled, computations),
        (result) =>
          updateRec({
            roots: result.updated,
            computations: result.computations,
            done: result.done,
            canceled: result.canceled
          })
      );
    };

    const computations: Computations<V> = [];
    const release = this.working.startNewComputation();
    for (const id of roots) {
      computations[id] = dispatch(
        this.get(id).consolidatedValueWthUndefined,
        (v) => (v === undefined ? cancelComputation : v)
      );
    }
    return dispatch(
      // first we compute all possible updates
      updateRec({
        roots: new Set(roots),
        computations,
        done: finished,
        canceled: new Set()
      }),
      // then we notify all modified cells
      (_result) => {
        if (this._debug) {
          // @todo _watchAll
          const inter = intersection(roots, this._logList);
          inter.length &&
            console.log("Update Finished", this.naming({ _result }));
        }
        this._internalNotify(_result.done);
        release();
        // Collect garbage
        if (this._gc.size) {
          const l = Array.from(this._gc);
          if (this._debug) {
            // const inter = intersection(l, this._logList);
            console.log({ deleting: l });
          }
          this._gc = new Set();
          this.delete(...l);
        }
      }
    );
  }
  private registerCancelAndDone<V>(
    updatable: number[],
    computations: (V | Canceled | Error)[],
    done: Set<number>,
    canceled: Set<number>
  ): void {
    const maybeDone: Set<number> = new Set();
    for (const id of updatable) {
      if (computations[id] instanceof Canceled) {
        canceled.add(id);
      } else {
        maybeDone.add(id);
      }
    }

    const pointersToCanceled = this._pointers.strictlyReachableProperty(
      maybeDone,
      (id) => canceled.has(id),
      {
        next: (id) => this._pointers.predecessors(id)
      }
    );

    //@todo shall we do something not quadratic
    for (const id of maybeDone) {
      if (pointersToCanceled.has(id)) {
        canceled.add(id);
      } else {
        done.add(id);
      }
    }
  }

  private updateIteration<V>(
    ids: Set<number>,
    done: Set<number>,
    canceled: Set<number>,
    computations: Computations<V>
  ): IterationResult<V> | Promise<IterationResult<V>> {
    if (this._debug) {
      const inter = this._logList.filter((v) => ids.has(v));
      inter.length &&
        console.log(this.naming({ updateIterationOn: ids, done, canceled }));
    }
    const isPointer = (id: number) => this.get(id).isPointer;
    /** List of nodes that will be updated  */
    const selection = this.selectUpdatableCells(ids, isPointer);
    const {
      toBeRecomputed,
      updatable,
      pointersToBeUpdated,
      grey,
      mightChange
    } = selection;
    if (this._debug) {
      const inter = this._logList.filter((v) => ids.has(v));
      inter.length &&
        console.log(
          "selectUpdatableCells result",
          this.naming({
            ...selection,
            done,
            canceled
          })
        );
    }
    //@todo Isn't this check too costly
    for (const id of toBeRecomputed) {
      if (done.has(id) || canceled.has(id)) {
        console.error(
          "Error - recomputing an already computed cell !:",
          this.naming({
            cell: id,
            ...selection,
            done,
            canceled
          })
        );
      }
    }
    // Form now on, we need updatable pointers to be up-to-date to continue
    const newComputations = this.computeUpdatable(toBeRecomputed, computations);
    const borderComputation = dispatchPromiseOrValueArray(
      newComputations,
      // wait for all new computations to be over before proceeding to the next step
      (newComputations) => {
        // finding all canceled computations
        this.registerCancelAndDone<V>(
          updatable,
          newComputations,
          done,
          canceled
        );
        const nextIteration = this.selectBorderUpdatable(
          ids,
          updatable,
          pointersToBeUpdated,
          grey,
          isPointer
        );
        return {
          computationsOfBorder: this.computeUpdatable(
            nextIteration.toBeRecomputedBorder,
            computations
          ),
          nextIteration
        };
      }
    );

    //once again, we will wait for the new computations to be over
    const result: IterationResult<V> | Promise<IterationResult<V>> = dispatch(
      borderComputation,
      ({ computationsOfBorder, nextIteration }) => {
        return dispatchPromiseOrValueArray(
          computationsOfBorder,
          (computationsOfBorder) => {
            //checking for canceled computations
            this.registerCancelAndDone(
              nextIteration.safeBorder,
              computationsOfBorder,
              done,
              canceled
            );
            const iterationResult = {
              computations,
              updated: new Set([
                ...updatable,
                ...nextIteration.toBeRecomputedBorder
              ]),
              done,
              canceled,
              greyUpdatedPointers: nextIteration.greyUpdatedPointers,
              greenPointers: nextIteration.greenPointers
            };
            if (this._debug) {
              // @todo consider more cells (or optionally all)
              const inter = this._logList.filter((v) => ids.has(v));
              inter.length &&
                console.log(
                  "Border recomputed, end of iteration:",
                  this.naming(iterationResult)
                );
            }
            return iterationResult;
          }
        );
      }
    );
    return result;
  }

  private selectBorderUpdatable(
    roots: Set<number>,
    updated: number[],
    pointersToBeUpdated: number[],
    grey: number[],
    isPointer: (id: unknown) => boolean
  ): {
    toBeRecomputedBorder: number[];
    safeBorder: number[];
    greyUpdatedPointers: Set<number>;
    greenPointers: number[];
  } {
    /** List of pointers nodes that have been updated,
     * any node in toBeUpdated that is not yet updated indirectly depends on them */
    const updatedPointers = updated.filter(isPointer);

    /** List of updated pointers nodes that have been updated whose pointed value might still change,
     *  The pointer it  self will not move, but the pointed value waits for an update
     */
    const greyUpdatedPointers = this._pointers.strictlyReachableProperty(
      updatedPointers,
      (id) => grey.includes(id)
    );
    /** List of updated pointers nodes that have been updated adn whose pointed value will not change */
    const greenPointers = updatedPointers.filter(
      (id) => !greyUpdatedPointers.has(id)
    );

    /** candidates for next update iteration */
    const border = Array.from(
      new Set(greenPointers.flatMap((id) => this.dependentCells(id)))
    );

    /** candidates whose value depends indirectly on a grey value are unsafe */
    const unsafeBorder = this.g.strictlyReachableProperty(
      border,
      (id) => grey.includes(id),
      {
        next: (id) =>
          Array.from(
            new Set([
              ...(this.g.predecessors(id) || []),
              ...(this._pointers.predecessors(id) || [])
            ])
          )
      }
    );
    /** retaining only safe candidates */
    const safeBorder = border.filter((id) => !unsafeBorder.has(id));
    const toBeRecomputedBorder = safeBorder.filter(
      (id) =>
        this.g
          .predecessors(id)
          .filter((idPred) => updated.includes(idPred) || roots.has(idPred))
          .length > 0
    );
    const res = {
      toBeRecomputedBorder,
      safeBorder,
      greyUpdatedPointers,
      greenPointers
    };
    if (this._debug) {
      const inter = this._logList.filter(
        (v) => roots.has(v) || updated.includes(v)
      );
      inter.length && console.log("Prepared Border: ", this.naming(res));
    }
    return res;
  }

  private dependentCells(id) {
    return Array.from(new Set([...this.g.get(id), ...this._pointers.get(id)]));
  }
  /**
   * Computes the cells that can be safely computed.
   * Safely means that their dependencies will not change until an external modification occurs.
   *
   * @param ids cells that have been modified
   * @param isPointer function that detect pointer cells
   * @returns { toBeRecomputed,updatable; pointersToBeUpdated; grey} where
   *            toBeRecomputed holds the cell that to be recomputed in computation order
   *            updatable holds the cell that will be updated in updating order
   *            pointersToBeUpdated: the pointer that will eventually be updated
   *            grey: all the cells whose value will eventually change or be recomputed
   */
  private selectUpdatableCells(
    ids: Set<number>,
    isPointer: (id: unknown) => boolean
  ): {
    toBeRecomputed: number[];
    updatable: number[];
    pointersToBeUpdated: number[];
    grey: number[];
    mightChange: number[];
  } {
    const next = (id) => this.dependentCells(id);

    const mightChange =
      this.g
        .partialTopologicalSortRootsSet(Array.from(ids), {
          includeRoots: false,
          next
        }) // we remove ids as they should have been computed/modified in the right order.
        .filter((id) => !ids.has(id)) || [];
    /** List of nodes that will be updated that currently are pointers  */
    const pointersToBeUpdated = mightChange.filter(isPointer);

    /** List of nodes that transitively depends on pointers to be updated,
     *  or on pointers to nodes to b updated  */
    const grey =
      this.g.partialTopologicalSortRootsSet(pointersToBeUpdated, {
        next,
        includeRoots: false
      }) || [];

    /** List of nodes that can safely be immediately updated, in evaluation order */
    const updatable = mightChange.filter((id) => !grey.includes(id));
    /** List of nodes that actually needs to be recomputed, in evaluation order */
    const toBeRecomputed = updatable.filter(
      // only keep those which
      (id) =>
        this.g
          .predecessors(id)
          .filter((idPred) => updatable.includes(idPred) || ids.has(idPred))
          .length > 0
    );
    return {
      toBeRecomputed,
      updatable,
      pointersToBeUpdated,
      grey,
      mightChange: mightChange
    };
  }

  /**
   * Recompute the given cells' value.
   * The computation are added to the given computations dictionary.
   *
   * @param toBeRecomputed ids of cells to be recomputed
   * @param computations   dictionary of computations
   * @returns a dictionary with only the newly triggered computations
   */
  private computeUpdatable<V>(
    toBeRecomputed: number[],
    computations: Computations<V>
  ): Computations<V> {
    const order = toBeRecomputed.slice(); // slice copies the array
    let currentCellId: number | undefined;
    const newComputations = [];

    // biome-ignore lint/suspicious/noAssignInExpressions: shorter, still explicit
    while ((currentCellId = order.pop()) !== undefined) {
      const cell: AnyCell<unknown> = this._cells[currentCellId];
      if (cell !== undefined) {
        if (this._debug && this._logList.includes(currentCellId)) {
          console.log(
            "Sheet.computeUpdatable, running computation of:",
            this.naming({
              cell: cell.id,
              computations
            })
          );
        }
        const pending: Pending<V, unknown> | CellResult<V, unknown> =
          cell instanceof MapCell
            ? cell._computeValue(computations, false)
            : cell.consolidatedValueWthUndefined;
        const newComputation = dispatch(pending, (v) =>
          v === undefined ? cancelComputation : v
        );
        computations[currentCellId] = newComputation;
        newComputations[currentCellId] = newComputation;
      } else {
        console.warn(
          `Computation requested for deleted cell: ${currentCellId}`
        );
        const error = new Error(`Deleted cell: ${currentCellId}`);
        // dependencies has been asynchronously deleted
        computations[currentCellId] = error;
        newComputations[currentCellId] = error;
      }
    }
    return newComputations;
  }

  recompute() {
    //@ts-expect-error actually keys are number, everything might be fine
    this._update(Object.keys(this._cells));
  }

  private canDelete(ids: number[]): boolean {
    const deps: Set<number> = new Set();

    for (const id of ids)
      for (const dep of this.g.partialTopologicalSort(id)) deps.add(dep);
    for (const id of ids) deps.delete(id);
    return deps.size === 0;
  }

  delete(...input: (number | AnyCell<unknown>)[]) {
    const ids = input.map((v) => (typeof v === "number" ? v : v.id));
    if (!this.canDelete(ids)) {
      throw ReferencesLeft;
    }
    for (const id of ids) {
      this.g.delete(id);
      delete this._cells[id];
      this[size]--;
    }
  }

  /**
   * collect marks cells for deletion by the garbage collector.
   */
  collect(...input: (number | AnyCell<unknown>)[]) {
    const ids = input.map((v) => (typeof v === "number" ? v : v.id));
    for (const id of ids) this._gc.add(id);
  }
}
