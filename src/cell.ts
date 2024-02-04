const DEV = false;
const DEBUG_RANK = false;

import { CellError } from "./errors";
import { dispatch, dispatchPromiseOrValueArray } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";
import { type Unsubscriber } from "./types";

let idCounter = 0;

function generateFreshId() {
  return idCounter++;
}

/**
 * Represents a canceled computation
 */
export class Canceled {}

/** Preallocated cancel */
export const cancelComputation = new Canceled();

/** Result storable in a Cell */
export type CellResult<V, CanBeError> = CanBeError extends true ? V | Error : V;

export type CellResultOrPointer<V, CanBeError> =
  | CellResult<V, CanBeError>
  | AnyCell<V>;

/** pending value of a cell */
export type Pending<V, CanBeError> = Promise<CellResult<V, CanBeError>>;

/** Result of a computation that could be canceled */
type MaybeResultOrPointer<V, CanBeError> =
  | CellResultOrPointer<V, CanBeError>
  | Canceled;

type MaybeResult<V, CanBeError> = CellResult<V, CanBeError> | Canceled;

/**Pending result of a computation */
type PendingMaybe<V, CanBeError> = Promise<MaybeResultOrPointer<V, CanBeError>>;

/** Promise of a pending array of computation result */
export type PendingArray<V, CanBeError> = Promise<
  MaybeResultOrPointer<V, CanBeError>[]
>;

/** Array of (maybe pending) computation results */
export type MaybePendingDict<V, CanBeError> = (
  | PendingMaybe<V, CanBeError>
  | MaybeResultOrPointer<V, CanBeError>
)[];

export type Not<T extends boolean> = T extends true ? false : true;

export type OnlyA<A extends boolean, B extends boolean> = A extends true
  ? B extends false
    ? true
    : false
  : false;

abstract class SubscribeBench<V> {
  protected _subscribers: [(value: V) => void, number][] = [];
  protected abstract value: V;

  get name(): string {
    return "Unextended Subscriber";
  }
  /**
   * subscribe to changes in the cell value
   * @param run the subscriber callback
   * @param invalidate unused for now
   * @returns a callback that allows to unsubscribe
   * @todo invalidate
   */
  public subscribe(
    runRaw: (value: V) => void,
    invalidate?: (value?: V) => void
  ): () => void {
    // initial run if value is defined
    const value = this.value;
    const id = generateFreshId();
    const run = (v: V) => {
      DEV &&
        console.log({
          RunSubscriberOfCell: this.name,
          subscriber: id,
          value: v
        });
      runRaw(v);
    };
    // not sure that it makes sense to dispatch here,
    // why would we notify on a promise ?
    dispatch(
      value,
      (value) => {
        if (value instanceof Canceled) return;
        // if their is no value, wait for the
        // next update for the first notification
        if (value !== undefined) {
          run(value);
        }
      } // else {
      //   console.log(`Cell ${this.name}: `,
      //              `subscribed with undefined value or error`) }
    );
    // console.log(`Cell ${this.name}: `, `subscriber  ${id} registered`);
    const subscriber: [(value: V) => void, number] = [run, id];
    this._subscribers.push(subscriber);
    return () => {
      // console.log({
      //   cell: this.name,
      //   subscriber: id,
      //   unsubscribeOccurrences: this._subscribers.map((f) => f[0] === run),
      // });
      // returns an unsubscribe function
      const index = this._subscribers.indexOf(subscriber);
      if (index !== -1) this._subscribers.splice(index, 1);
    };
  }

  get subscribersCount() {
    return this._subscribers.length;
  }

  /**
   * notify all subscribers that the cell value has changed
   * @description notifies only if the value is defined (hStore semantics) and not an error
   */
  _notifySubscribers() {
    DEV &&
      console.log({
        NotifySubscribersOfCell: this.name,
        subscribers: this._subscribers,
        value: this.value
      });
    if (this.value !== undefined) {
      const subscribers = Array.from(this._subscribers);
      for (const subscriber of subscribers) {
        // console.log({
        //   cell: this.id,
        //   step: "notify",
        //   subscriberId: subscriber[1],
        // });
        subscriber[0](this.value as V);
      }
    }
  }
}

/**
 * Cell is a basic Store unit.
 * There are two types of cells:
 * 1. Cells containing values
 * 2. Cells containing expressions
 *
 * Cells should **never** be created manually, but like this:
 * @example const sheet = new Sheet()
 *          const cell = sheet.new(...)
 *          const cell2 = cell.map( f )
 *          const cell3 = sheet.map( [cell,cell2], f2)
 */
export class Cell<
  V,
  IsComputed extends boolean,
  NoFail extends boolean,
  MaybeError = OnlyA<IsComputed, NoFail>
> extends SubscribeBench<CellResult<V, MaybeError>> {
  readonly _sheet: Sheet | SheetProxy;
  readonly id: number;
  readonly dependencies: number[];
  // @todo define Result type?
  protected v: CellResultOrPointer<V, MaybeError> | undefined;
  protected _noFail: boolean;

  /** if [_valueRank] is lower than [_currentComputationRank],
      it means that [v] will be invalidated by an ongoing computation */
  protected _valueRank = 0;
  protected _currentComputationRank = 0;

  protected _pending_: PendingMaybe<V, MaybeError> | undefined;
  private _pendingRank: number = null;
  private _pendingResolve = (_: MaybeResultOrPointer<V, MaybeError>) => {};

  protected _lastStateIsError: boolean;
  protected _isPointer: boolean;
  protected _pointed: number | undefined;
  /**
   * optional key for localStorage persistence.
   */
  protected _storageKey: string | undefined;

  constructor(
    sheet: Sheet | SheetProxy,
    id: number,
    dependencies: number[] | undefined = undefined,
    options: { noFail: boolean } = {
      noFail: false
    }
  ) {
    super();
    // console.log(`Cell ${id}: `, "construction start")
    this._sheet = sheet;
    this.id = id;
    this.dependencies = dependencies || [];
    this._lastStateIsError = false;
    this._noFail = options.noFail;
    this._isPointer = true;
    // console.log(`Cell ${id}: `, "constructed")
  }

  get isPointer(): boolean {
    return this._isPointer;
  }

  get sheet(): Sheet {
    if (this._sheet instanceof SheetProxy) return this._sheet._sheet;
    return this._sheet;
  }

  /**
   * Change the pointed value
   * @param newPointed
   */
  setPointed(newPointed: number | null): void {
    DEV &&
      console.log("setPointed:", {
        cell: this.name,
        newPointed,
        currentlyPointed: this._pointed
      });
    if (newPointed !== this._pointed) {
      this.sheet._updatePointer(
        this.id,
        this._pointed,
        newPointed === null ? undefined : newPointed
      );
      this._isPointer = true;
      this._pointed = newPointed === null ? undefined : newPointed;
      // @todo auto-detection or only from constructor? Should we prevent non-pointer cells to set a pointed
    }
  }

  /**
   * If this cell is a pointer, change the pointed value
   * @param newPointed
   */
  unsetPointed(): void {
    DEV &&
      console.log("unsetPointed:", {
        cell: this.name,
        currentlyPointed: this._pointed
      });
    this.sheet._updatePointer(this.id, this.pointed, undefined);
    this._isPointer = false;
    this._pointed = undefined;
  }

  get pointed(): number | undefined {
    return this._isPointer ? this._pointed : undefined;
  }

  get pointedCell(): AnyCell<V> | undefined {
    //@ts-expect-error _isPointer ensure v is a cell
    return this._isPointer && !this.v === null ? this.v : undefined;
  }

  /** Give a [name] to the cell */
  bless(name: string) {
    this._sheet.bless(this.id, name);
    DEV && console.log(`Cell ${this.id} name is  ${name} - ${this.name}`);
  }

  get name(): string {
    return this._sheet.name(this.id);
  }

  /**
   * get the immediate cell value. or pointed value
   * For internal use only: It disregards any pending computation.
   *
   * @todo this should probably be deprecated.
   *  */
  get value(): CellResult<V, MaybeError> | undefined {
    //@ts-expect-error ! _isPointer ensure v is a not cell
    return this.isPointer ? (this.v === null ? null : this.v?.value) : this.v;
  }

  /**
   * set the this._pending_ property whenever a computation is triggered or set is called with a  promises
   * this should be called with a promise which is fulfilled only once the value has been set.
   * typically, in a promise who holds a call to this._setValueOnComputationCompletion.
   */
  protected setPendingComputation<C>(rank: number, computation: Promise<C>) {
    this._sheet.working.addComputation(this.id, computation);
    DEBUG_RANK &&
      console.log("setPendingComputation", {
        cell: this.name,
        rank,
        pendingRank: this._pendingRank,
        currentComputationRank: this._currentComputationRank,
        valueRank: this._valueRank
      });
    if (this._pendingRank === null || this._pending_ === undefined) {
      this._pending_ = new Promise<V | Canceled>((resolver, _rejecter) => {
        this._pendingResolve = resolver;
      });
      this._pendingRank = rank;
    } else if (rank > this._pendingRank) {
      this._pendingRank = rank;
    } else {
      //if the current rank is higher than the added computation, just do nothing
      return;
    }
    computation.then(
      (v) => {
        DEBUG_RANK &&
          console.log("setPendingComputation-> after computation", {
            cell: this.name,
            rank,
            pendingRank: this._pendingRank,
            currentComputationRank: this._currentComputationRank,
            valueRank: this._valueRank,
            v
          });
        if (rank === this._pendingRank) {
          this._pendingRank = null;
          this._pendingResolve(v);
        }
      },
      () => {
        DEBUG_RANK &&
          console.log("setPendingComputation->computationRejected", {
            cell: this.name,
            rank,
            pendingRank: this._pendingRank,
            currentComputationRank: this._currentComputationRank,
            valueRank: this._valueRank
          });
        if (rank === this._pendingRank) {
          this._pendingRank = null;
          this._pendingResolve(cancelComputation);
        }
      }
    );
  }

  /** Wait until current pending computation is over and return the cell value
   * If Cell is a pointer, returns the pointed cells
   */
  get pendingValue(): PendingMaybe<V, MaybeError> | undefined {
    if (this._pending_ === undefined) {
      this._pending_ =
        this.v === undefined ? undefined : Promise.resolve(this.v);
    }
    return this._pending_;
  }

  /** returns when the cells computation is over.
   * If cell is a pointer, we don't wait for the pointed cell to be ready
   */
  get working(): Promise<void> {
    if (this._pending_ === undefined) return Promise.resolve();

    // wait for current computation to complete ang check that there are no new pending computation
    return this._pending_.then(() => {});
  }

  /** If no ongoing computation, then current value, else a promise of value.
   *  If cell is a pointer, returns the pointed value
   * Warning:
   * If cell's dependencies are updated faster than the cell can compute the update,
   * this will never end.
   */
  get consolidatedValue(): Pending<V, MaybeError> | CellResult<V, MaybeError> {
    DEV &&
      console.log("consolidatedValue Call: ", {
        cell: this.name,
        valueRank: this._valueRank,
        currentComputationRank: this._currentComputationRank
      });

    if (this._valueRank === this._currentComputationRank) {
      if (this.isPointer)
        return this.v === undefined
          ? this.get()
          : this.v === null
            ? null
            : //@ts-expect-error isPointer ensures we have a cell here
              this.v.consolidatedValue;

      //@ts-expect-error !isPointer ensures we have *not* cell here
      return this.v === undefined ? this.get() : this.v;
    }

    //@ts-expect-error the value is invalidated only when a promise exists
    const pending: PendingMaybe<V> = this._pending_;
    return pending.then((v: Pending<V, MaybeError>) =>
      v instanceof Canceled
        ? this.consolidatedValue // pending computation aborted, retry to get a value
        : this.isPointer
          ? this.v === null
            ? null
            : //@ts-expect-error isPointer ensures we have a cell here
              this.v.consolidatedValue //getting pointed consolidated
          : v
    );
  }

  /** If no ongoing computation, then current value, else a promise of value.
   *  If cell is a pointer, returns the pointed value
   * Warning:
   * If cell's dependencies are updated faster than the cell can compute the update,
   * this will never end.
   */
  get consolidatedValueWthUndefined():
    | Pending<V, MaybeError>
    | CellResult<V, MaybeError> {
    DEV &&
      console.log("consolidatedValueWthUndefined Call:", {
        cell: this.name,
        valueRank: this._valueRank,
        currentComputationRank: this._currentComputationRank
      });

    if (this._valueRank === this._currentComputationRank) {
      if (this.isPointer) {
        // @ts-expect-error Cell<V>
        return this.v === undefined || this.v === null
          ? this.v
          : // isPointer ensures we have a cell here
            (this.v as Cell<V, boolean, boolean>).consolidatedValueWthUndefined;
      }

      //@ts-expect-error !isPointer ensures we have *not* cell here
      return this.v;
    }

    const pending: PendingMaybe<V, MaybeError> = this._pending_;
    if (pending === undefined) {
      console.error(
        "Pending undefined although compRak differs from value rank",
        this.sheet.naming({
          cell: this.id,
          valueRank: this._valueRank,
          compRank: this._currentComputationRank
        })
      );
      return undefined;
    }

    return pending.then((v: MaybeResultOrPointer<V, MaybeError>) =>
      this.isPointer
        ? this.v === null || this.v === undefined
          ? this.v
          : //@ts-expect-error isPointer ensures we have a cell here
            this.v.consolidatedValueWthUndefined
        : v
    );
  }
  /** get the error (for compute cells)
   * if cell is a pointer, it won't expose the errors in the pointed cell,
   * only errors in pointer computation.
   */
  get error(): Error {
    return this.v instanceof Error ? this.v : undefined;
  }
  /** get the error (for compute cells). Wait for ongoing computation to end. */
  get consolidatedError(): Error {
    //@todo, what about pointers (is pointing to an error, an error ?)
    //@ts-expect-error Don't know why this error pops after intro of pointers
    return dispatch(this.consolidatedValue, (value) =>
      this.v instanceof Error ? this.v : undefined
    );
  }

  /** force a refresh with the same value without equality check (for imperative structures) */
  refresh(): void {
    // console.log(`Cell ${this.name}: `, { refresh: this.v });
    this._sheet._update(this.id);
  }

  /**
   * Set the cells value and call sheet update if needed.
   *
   * It first check that the computation that led to this value has not been invalidated.
   *
   * @param computedValue  the result to store
   * @param computationRank counter of the computation. Used to cancel value
   *                        update if another call to set has been performed since
   *                        the pending computation was triggered.
   */
  protected _setValueOnComputationCompletion(
    newValue: CellResultOrPointer<V, MaybeError>,
    computationRank: number,
    update: boolean,
    skipSubscribers = false
  ): void {
    DEV &&
      console.log(`Cell ${this.name}: `, `Trying to set to ${newValue}`, {
        currentValue: this.value,
        currentCompRank: this._currentComputationRank,
        currentValueRank: this._valueRank,
        newValueRank: computationRank
      });
    if (newValue === undefined) {
      DEV && console.trace();
      // if the value to be set is 'undefined',
      // the value is ignored.
      // we should make the cell invalid (ie we don't set valueRank to computationRank),
      // so that consolidatedValue will block until a new value is set.
      // meaning no depending cell could be updated.
      // It also mean that any update triggered on depending cells would be locked.
      // It would also require to set a pending value that should be resolved later on into this._pending.
      if (this._currentComputationRank === computationRank) {
        this._valueRank = computationRank;
      }
      return;
    }

    // Invalidation for outdated computation
    if (computationRank < this._valueRank) {
      DEV &&
        console.log(
          `Cell ${this.name}: `,
          `setting to ${newValue} has been invalidated`,
          {
            currentRank: this._currentComputationRank,
            newValueRank: computationRank
          }
        );
      return;
    }

    const needUpdate = !this._sheet.equals(this.v, newValue);
    DEV &&
      console.log(`Cell ${this.name}: `, `Actually setting to ${newValue}`, {
        currentValue: this.value,
        currentRank: this._currentComputationRank,
        newValueRank: computationRank
      });
    this.v = newValue;
    this._valueRank = computationRank;
    // Update localStorage if set.
    if (needUpdate && this._storageKey) {
      try {
        const j = this.sheet._marshaller(newValue);
        localStorage.setItem(this._storageKey, j);
        DEV && console.log("ValueCell", { set: j, key: this._storageKey });
      } catch (_) {
        DEV &&
          console.log("ValueCell: LocalStorage not available", {
            key: this._storageKey
          });
      }
    }
    if (this.v instanceof Error && !(this.v instanceof CellError)) {
      this._sheet.errors._setCellError(this.id, this.v);
      this._lastStateIsError = true;
    } else {
      if (this._lastStateIsError) this._sheet.errors._unsetCellError(this.id);
    }
    if (newValue instanceof Cell) {
      this.setPointed(newValue.id);
    } else {
      if (this._isPointer)
        if (newValue === null) {
          this.setPointed(null);
        } else {
          DEBUG_RANK &&
            console.log("unsetting pointer", { cell: this.name, newValue });
          this.unsetPointed();
        }
    }
    if (this._currentComputationRank === computationRank) {
      // only updating if we are the last ongoing computation
      if (needUpdate) {
        if (!skipSubscribers) {
          // @todo : remember the last notify rank and run notify on last computations, even if canceled,
          // if lastNotified < valueRank.
          // This requires to
          // 1. have a list of ranks of pending computations
          // 2. on computation success or cancel, remove the rank from the list
          // 3. if lastNotified < valueRank, and no pending have rank > valueRank, then notify the new value.
          this._notifySubscribers();
        }
        if (update) {
          // console.log(`Cell ${this.name}: `, `updating as value changed`);
          this._sheet._update(this.id);
        }
      }
    }
  }

  // /** apply an immer patch */
  // apply(patch: (v: V) => void): void {
  //   const next = produce(this.v, patch);
  //   if (next !== undefined) this.set(next);
  // }

  /**
   * Creates a new Cell that map this cell directly.
   * @param fn
   * @param name optional name of the new cell
   * @param noFail is true when the mapped function never returns an error
   * @returns mapped cell
   */
  map = <T, NF extends boolean = false>(
    fn: (v: V, prev?: T) => T | Promise<T | AnyCell<T>> | AnyCell<T>,
    name?: string,
    noFail?: NF
  ): MapCell<T, NF> =>
    this._sheet instanceof SheetProxy
      ? ((this._sheet as SheetProxy).map(
          [this as AnyCell<V>],
          fn,
          name,
          noFail
        ) as MapCell<T, NF>)
      : ((this._sheet as Sheet).map(
          [this as AnyCell<V>],
          fn,
          name,
          undefined,
          noFail
        ) as MapCell<T, NF>);

  init = <T>(
    fn: (v: V) => T | Promise<T>,
    name?: string
  ): ValueCell<T | null> => {
    const getter = async () => {
      const v = await this.get();
      // @todo notify the error
      if (v instanceof Error) return null;
      return fn(v as V);
    };
    const cell =
      this._sheet instanceof SheetProxy
        ? (this._sheet as SheetProxy).new(getter(), name)
        : (this._sheet as Sheet).new(getter(), undefined, name);
    // if (name) cell.bless(name);
    return cell;
  };

  /** creates a new CellError.
   * @param reason the cause of the error
   * @param source optional source from which th error comes
   */
  protected newError<R>(reason: R, source: number | undefined = undefined) {
    if (source === undefined) return reason as Error;

    const sourceName = this._sheet.name(source);
    // console.log(
    //   `Cell ${this.name}: `,
    //   `Error at ${sourceName}(${source}) : ${reason}`
    // );
    if (reason instanceof CellError) {
      return reason;
    }

    return new CellError(source, reason, sourceName);
  }

  // Applications

  /**
   * get the latest defined value (wait for a value to be available if undefined)
   *
   * Please consider using [consolidatedValue] accessor instead,
   * as it waits for any ongoing computation and could help if you want to ensure
   * consistency of values across the sheet.
   *
   * @returns the latest defined value of the cell
   * @todo move to an extended class?
   */
  get = async () =>
    this.value !== undefined
      ? this.value
      : // @todo handle rejections?
        new Promise<CellResult<V, MaybeError>>((resolve) => {
          // biome-ignore lint/style/useConst: uns needs to be defined in function
          let uns: Unsubscriber;
          uns = this.subscribe((v) => {
            // console.log({ cell: this.name, notification: Date.now() });
            if (v !== undefined) {
              // console.log({ cell: this.name, isDefined: true });
              uns();
              resolve(v);
              // console.log({ cell: this.name, resolved: true, v });
            }
          });
          // console.log(this._subscribers);
        });
}

export class ValueCell<V> extends Cell<V, false, false> {
  constructor(
    sheet: Sheet | SheetProxy,
    id: number,
    orig: (AnyCell<V> | V) | undefined = undefined,
    options?: { name?: string; _storageKey?: string }
  ) {
    super(sheet, id);

    let value = orig;

    // If storageKey, try to load a previously saved value.
    if (options?._storageKey) {
      try {
        const item = localStorage.getItem(options?._storageKey);
        DEV && console.log("ValueCell", { id, options, item });
        if (item !== null) value = JSON.parse(item) as V;
        this._storageKey = options?._storageKey;
      } catch (_) {
        DEV &&
          console.log("ValueCell: LocalStorage not available", { id, options });
      }
    }

    if (value !== undefined) {
      this.v = value;
      if (value instanceof Cell) {
        this.setPointed(value.id);
      } else {
        this._isPointer = false;
      }
      this.setPendingComputation(0, Promise.resolve(value));
    }
  }

  /** Updates the cell value.
   *
   * In case we set a pending promise of value, and this promise is rejected,
   * the cell's value stays untouched
   * and the promise returned by set is resolved to the error
   *
   * @throws an error if it is a compute cell
   */
  public set(
    value: AnyCell<V> | Promise<AnyCell<V>> | V | Promise<V>
  ): void | Promise<void> {
    DEV && console.log("Setting cell value", { cell: this.name, value });
    this._currentComputationRank += 1;
    const computationRank = this._currentComputationRank;

    if (value instanceof Promise) {
      // console.log(
      //   `Cell ${this.name}: `,
      //   `Setting a promise: comp rank ${computationRank}, value rank ${this._valueRank}`
      // );
      // set cell value on promise resolution
      const computation = value.then(
        (v: CellResultOrPointer<V, false>) =>
          // console.log({ setPromisedInCell: this.name, resolvedToValue: v });
          this._setValueOnComputationCompletion(v, computationRank, true, true),
        (error) =>
          this._setValueOnComputationCompletion(
            error,
            computationRank,
            true,
            true
          )
      );
      this.setPendingComputation(computationRank, computation);
      return computation;
    }

    // console.log(`Cell ${this.name}: `, `setting a direct value ${value}`);
    this._setValueOnComputationCompletion(value, computationRank, true, true);
    this.setPendingComputation(computationRank, Promise.resolve(value));
  }

  /**
   * applies a functional update to the store.
   * @throws an error if [v] is undefined or an Error or a pointer
   * @todo throw an error if fn fails?
   * @todo make it concurrency-friendly
   */
  update = (
    fn: (v: V) => V | Promise<V> | AnyCell<V> | Promise<AnyCell<V>>
  ) => {
    if (this.isPointer) throw this.newError("Cell is a pointer");
    // this line is here to help the typechecker
    //@ts-expect-error isPointer rules out AnyCell
    const v: V | Error | undefined = this.v;
    if (v === undefined) throw this.newError("Cell not initialized");
    if (v instanceof Error) throw this.newError("Cell has error");
    if (this._currentComputationRank !== this._valueRank) {
      throw this.newError(
        `Cell's value is being concurrently computed, cannot update`
      );
    }
    const nv = fn(v);
    this.set(nv);
  };

  /**
   * applies a non-functional update to the store.
   * This will systematically trigger an update of dependencies
   * as this is used to perform side effects on the value and their
   * is no mean to know if the value changed
   * @throws an error if [v] is undefined or an Error
   * @todo throw an error if fn fails?
   * @todo make it concurrency-friendly
   */
  apply = (fn: (v: V) => void | Promise<void>) => {
    // this line is here to help the typechecker
    if (this.isPointer) throw this.newError("Cell is a pointer");
    //@ts-expect-error isPointer rules out AnyCell
    const v: V | Error | undefined = this.v;
    if (v === undefined) throw this.newError("Cell not initialized");
    if (v instanceof Error) throw this.newError("Cell has error");
    if (this._currentComputationRank !== this._valueRank) {
      throw this.newError(
        `Cell's value is being concurrently computed, cannot update`
      );
    }
    // using set to record the ongoing computation in case f is asynchronous
    this.set(dispatch<void, V>(fn(v), () => v));
    this.refresh();
  };
}

/**
 * MapCell represents a Cell resulting from a map operation.
 */
export class MapCell<V, NF extends boolean> extends Cell<V, true, NF> {
  private _computeFn: (...args: V[]) => V | Promise<V> | AnyCell<V>;
  private _usePreviousValue: boolean;
  /**
   * Do not use outside Sheet
   */
  constructor(
    sheet: Sheet | SheetProxy,
    id: number,
    /** update function*/
    computeFn: (...args: V[]) => V | Promise<V> | AnyCell<V>,
    /**
     *@todo [dependencies] should match the parameters of [computeFn]
     */
    dependencies: AnyCell<V>[],
    usePreviousValue: boolean,
    noFail?: NF, // noFail indicates the computeFn
    isVolatile = false // @todo volatile functions like NOW() must be recomputed all the time
  ) {
    super(
      sheet,
      id,
      dependencies.map((cell) => cell.id),
      { noFail: noFail || false }
    );
    this._computeFn = computeFn;
    this._usePreviousValue = usePreviousValue;
    const comp = this._computeValue([], true);
    // no need to notify, there are no subscribers
    // @todo or should we, if initial computation is long, subscriber can come concurrently
  }

  /**
   * Gather all dependencies Promise, using provided dictionary first, getting others directly from the cells.
   *
   * @param provided dependencies provided by the sheet as their computation have been triggered before.
   * @returns The list of promise of values for all dependencies (in the order of the dependencies)
   */
  private _gatherDependencies(provided: {
    [key: number]: PendingMaybe<V, boolean> | MaybeResultOrPointer<V, boolean>;
  }): PendingArray<V, boolean> | MaybeResultOrPointer<V, boolean>[] {
    const deps: (PendingMaybe<V, boolean> | V)[] = [];
    // getting all deps
    // console.log(
    //   `Cell ${this.id}: gathering deps values from ${this.dependencies}, first looking into ${provided}`
    // );
    for (const id of this.dependencies) {
      const p = provided[id];
      const depP =
        p !== undefined
          ? p
          : // id's value was not provided, request it
            this._sheet.get(id).consolidatedValueWthUndefined;
      deps.push(depP as PendingMaybe<V, boolean> | V);
      // console.log(
      //   `Cell ${this.id}: gathering deps values, pushing ${depP} results in ${deps}`
      // );
    }
    if (deps.find((v) => v instanceof Promise) !== undefined)
      // if one deps is a promise, make a promise of them all
      return dispatchPromiseOrValueArray(deps, (v) => v);

    // no value is a promise, but the type system can't figure this out
    // alternatively to bypass the typechecker we could map and return error on promise,
    // but it has a cost at runtime.
    const all = deps as V[];
    // console.log(`Cell ${this.id}: gathering deps values, found ${all}`);
    return all;
  }

  /**
   * Do run the internal computation and eventually set the cells value
   * if computation has not been invalidated.
   * If any dependency is either canceled or undefined,
   * the actual computation is not triggered and cancelComputation is returned.
   *
   * If the computation returns undefined, cancelComputation is returned.
   *
   * @param params a sparse array of dependencies values
   * @param computationRank rank at which the computation has been requested
   * @returns
   */
  private _internalCompute(
    paramsResults: MaybeResult<V, Not<NF>>[],
    computationRank: number,
    forceNotification: boolean
  ): PendingMaybe<V, Not<NF>> | MaybeResultOrPointer<V, Not<NF>> | Canceled {
    // cancel when on dependency is canceled
    const firstCanceled = paramsResults.findIndex(
      (v) => v instanceof Canceled || v === undefined
    );
    if (firstCanceled >= 0) {
      this._setValueOnComputationCompletion(
        // dismiss current computation by setting the value to current value.
        // Note that it might invalidate pending computation that where correct.
        // this might not be the better way of handling the computation cancelation.
        // maybe computation rank settlement would better be a separate function ?
        this.value,
        computationRank,
        false,
        false
      );
      DEV &&
        console.log(
          "Cancel Computation on canceled parameter",
          this.sheet.naming({ paramsResults, firstCanceled, cell: this.id })
        );
      return cancelComputation;
    }
    // set to CellError when depending on an Error
    const firstError = paramsResults.findIndex((v) => v instanceof Error);
    if (firstError >= 0) {
      const firstCellWithError = this.dependencies[firstError];
      // console.log(
      //   `Cell ${
      //     this.name
      //   }: error in dependencies found dep #${firstError}, cell ${firstCellWithError} (${this.sheet.name(
      //     firstCellWithError
      //   )}) ${this.sheet.get(firstCellWithError).v}`
      // );
      // some parameters are errors
      const res = this.newError(paramsResults[firstError], firstCellWithError);
      this._setValueOnComputationCompletion(
        // @ts-expect-error we have an error, but NF may be wrongly set to true
        res,
        computationRank,
        false,
        !forceNotification
      );
      return res;
    }
    // Errors have been ruled out, so we can safely convert to V[]
    const params: V[] = paramsResults as V[];
    if (this._usePreviousValue && !(this.value instanceof Error))
      // @ts-expect-error @todo add previous value to type definitions
      params.push(this.value);

    // the computation invalidation can happen during
    // params resolution
    if (this._currentComputationRank === computationRank) {
      // launch computation
      let newValue: CellResult<V, Not<NF>> | Pending<V, Not<NF>> | AnyCell<V>;
      // @todo do we still check for errors in NoFail?
      try {
        newValue = this._computeFn(...params);
      } catch (error) {
        // @ts-expect-error
        newValue = this.newError(error);
      }
      // console.log(`Cell ${this.name}: `, `computed ${newValue} from ${params}`)
      // creating a promise that resolve on any value or error
      // @todo do we still check for errors in NoFail?
      // @ts-expect-error
      const newValuePromise: Pending<V, Not<NF>> = newValue instanceof Promise
        ? // transforming rejected promise into resolved error
          newValue.catch((error) => Promise.resolve(this.newError(error)))
        : Promise.resolve(newValue);

      const cancelOnUndefined = (v: AnyCell<V> | CellResult<V, Not<NF>>) =>
        v === undefined ? cancelComputation : v;
      // on promise, bind value setter, on value, set it immediately
      if (newValue instanceof Promise) {
        // binding value handling on the promise
        const pendingComputation = newValuePromise.then((v) => {
          this._setValueOnComputationCompletion(
            // @ts-expect-error @todo Not<NF> differs from MaybeError
            v,
            computationRank,
            false,
            !forceNotification
          );
          return cancelOnUndefined(v);
        });
        return pendingComputation;
      }
      // setting immediately the value
      this._setValueOnComputationCompletion(
        // @ts-expect-error @todo Not<NF> differs from MaybeError
        newValue,
        computationRank,
        false,
        !forceNotification
      );
      return cancelOnUndefined(newValue);
    }

    // canceling computation because an other one will supersede current values
    // console.log(`Computation canceled (comp rank ${computationRank}, current rank ${this._currentComputationRank})`);
    return cancelComputation;
  }

  /**
   * Start a potentially asynchronous computation of the cell value.
   *
   * @todo are we sure the rank is enough and we wont get mixed results in case to deps are concurrently updated ?
   *       Maybe we should use a global computation rank ?
   * @param providedDependencies are the pending value of all cell's dependencies
   */
  _computeValue(
    providedDependencies: MaybePendingDict<V, boolean>,
    // most of the time computations are in a batch,
    // the sheet takes care of grouped notifications
    forceNotification: boolean
  ): PendingMaybe<V, Not<NF>> | MaybeResultOrPointer<V, Not<NF>> {
    if (this._computeFn !== undefined) {
      try {
        // console.log({ computeForCell: this.name });
        // update computation rank to invalidate potential ongoing computation
        this._currentComputationRank += 1;
        const computationRank = this._currentComputationRank;
        // console.log(`Cell ${this.name}: `, `starting computation #${computationRank} on cell ${this.id}`)
        // get missing dependencies values or a promise to get them
        const params:
          | MaybeResultOrPointer<V, boolean>[]
          | Promise<MaybeResultOrPointer<V, boolean>[]> =
          this._gatherDependencies(providedDependencies);
        // we make the assumption here that thread are uninterruptible,
        // so it is fine to first compute the promise (if any async work) and then set the
        // this._pending value to this promise.
        // No other jobs in parallel could have set the _pending field.
        const computed:
          | MaybeResultOrPointer<V, Not<NF>>
          | PendingMaybe<V, Not<NF>> =
          // dispatching maybe-promises params and dereference pointers
          dispatch<
            MaybeResultOrPointer<V, Not<NF>>[],
            MaybeResultOrPointer<V, Not<NF>>
          >(params, (params) => {
            const dereferencedParams = params.map((p) =>
              // if current computation of id is provided, take it
              p instanceof Cell
                ? // if provided value is a cell, dereference it
                  p.value
                : p
            );
            return this._internalCompute(
              dereferencedParams,
              computationRank,
              forceNotification
            );
          });
        const pendingComputation: PendingMaybe<
          V | Canceled,
          Not<NF>
        > = computed instanceof Promise ? computed : Promise.resolve(computed);
        DEV &&
          console.log(`_computeValue in cell ${this.name}: `, {
            computed,
            pendingComputation
          });
        this.setPendingComputation(computationRank, pendingComputation);
        return computed;
      } catch (error) {
        console.error({ computeValueUncaughtErrorOnCell: this.name, error });
        // Here we cannot be certain to not be in an invalidated computation
        // so we don't set anything.
        return this.newError(error);
      }
    } else {
      // current value is not a computation.
      // Shall we fail instead or is it convenient to call compute on cell, whatever their kind ?
      return this.consolidatedValueWthUndefined;
    }
  }
}

export class Working extends SubscribeBench<boolean> {
  protected value = false;
  private pending: Promise<void> = Promise.resolve();
  private _onGoingComputation: Promise<void> = Promise.resolve();
  private _onGoingComputationCount = 0;
  private resolve = () => {};
  private _nextWorking: Working | undefined; // proxy have to notify the underlying sheet
  constructor(nextWorkingCell?: Working) {
    super();
    this._nextWorking = nextWorkingCell;
  }

  /**
   * This function records that a new computation is starting.
   * the returned callback is to be called when the said computation is over
   * @returns a callback to be called when the computation is over.
   */
  public startNewComputation() {
    this.value = true;
    if (this._onGoingComputationCount === 0) {
      this._onGoingComputation = new Promise((resolver) => {
        this.resolve = resolver;
      });
    }
    this._onGoingComputationCount++;
    return () => {
      this._onGoingComputationCount--;
      if (this._onGoingComputationCount === 0) {
        this.value = false;
        this.resolve();
      }
    };
  }

  /**
   * This will register the pending promise as an ongoing computation.
   * As long as [pending] is not settled, working will contain true.
   */
  public addComputation<V>(
    cell: number,
    pending: Promise<V> | CellResult<V, boolean>
  ): void {
    if (pending instanceof Promise) {
      // console.log(
      //   `Cell ${this.sheet.nameOfCell(cell)}`,
      //   " adds a computation "
      // );
      const resolver = this.startNewComputation();

      pending.finally(resolver);
      this._nextWorking?.addComputation(cell, pending);
    }
  }

  public get(): boolean {
    return this.value;
  }

  /**
   * Wait for current computations to finish
   * @returns a promise that settles when all there is no more pending computations
   */
  public wait(): Promise<void> {
    return this._onGoingComputation;
  }
}

export type ErrorsList = Map<number, Error>;
export class CellErrors extends SubscribeBench<ErrorsList> {
  private _nextErrorsCell: CellErrors | undefined; // proxy have to notify the underlying sheet
  protected value: ErrorsList;
  constructor(nextErrorsCell?: CellErrors) {
    super();
    this.value = new Map();
    this._nextErrorsCell = nextErrorsCell;
  }

  /**
   * Register an Error.
   */
  public _setCellError(cell: number, error: Error): void {
    this.value.set(cell, error);
    this._nextErrorsCell?._setCellError(cell, error);
  }

  /**
   * Unregister an Error.
   */
  public _unsetCellError(cell: number): void {
    this.value.delete(cell);
    this._nextErrorsCell?._unsetCellError(cell);
  }
  public get() {
    return this.value;
  }
}

export type AnyCell<
  T,
  C extends boolean = boolean,
  N extends boolean = boolean
> = Cell<T, C, N> | ValueCell<T> | MapCell<T, N>;
