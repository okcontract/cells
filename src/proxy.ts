import { type AnyCell, CellErrors, MapCell, ValueCell, Working } from "./cell";
import { dispatch } from "./promise";
import { Sheet } from "./sheet";
import type { AnyCellArray } from "./types";

/**
 * SheetProxy is a proxy that automatically registers locally
 * created cells to delete them in a single call.
 */
export class SheetProxy {
  _sheet: Sheet;
  /** locally created cells */
  private _list: AnyCell<unknown>[];
  readonly _id: number;
  readonly _name: string;

  working: Working;

  /** Cell holding all the current "initial" errors of the proxy */
  public errors: CellErrors;

  constructor(sh: Sheet, name?: string) {
    if (!sh) {
      throw new Error("no sheet");
    }
    this._sheet = sh;
    this._list = [];
    this.working = new Working(sh.working);
    this.errors = new CellErrors(sh.errors);
    if (name) this._name = name;
    this._id = sh.addProxy();
  }

  // a Sheet has id 0, proxies > 0
  get id() {
    return this._id;
  }

  bless(id: number, name: string) {
    this._sheet.bless(id, name);
  }

  name(id: number) {
    return this._sheet.name(id);
  }

  new<V>(
    value: V | AnyCell<V> | Promise<V | AnyCell<V>>,
    name?: string, // @todo migrate to options
    options?: { name?: string; _storageKey?: string }
  ): ValueCell<V> {
    const cell = this._sheet.new(value, this, name, options);
    // using the fact that if value is a pending promise,
    // consolidated value will resolve when value is resolved.
    this.working.addComputation(cell.id, cell.consolidatedValue);
    this._list.push(cell);
    return cell as ValueCell<V>;
  }

  // We still need to overload map to fix type inference
  // for variadic kinds.
  map<D1, V, NF extends boolean = false>(
    dependencies: [AnyCell<D1>],
    computeFn: (arg1: D1, prev?: V) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF>;
  map<D1, D2, V, NF extends boolean = false>(
    dependencies: [AnyCell<D1>, AnyCell<D2>],
    computeFn: (
      arg1: D1,
      arg2: D2,
      prev?: V
    ) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF>;
  map<D1, D2, D3, V, NF extends boolean = false>(
    dependencies: [AnyCell<D1>, AnyCell<D2>, AnyCell<D3>],
    computeFn: (
      arg1: D1,
      arg2: D2,
      arg3: D3,
      prev?: V
    ) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
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
    ) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
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
    ) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
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
    ) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
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
    ) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF>;

  /**
   * map a list to cells to a new cells using the compute function.
   * @param dependencies list of existing cells
   * @param computeFn function to apply to cells values and an extra argument
   * that is the previous value of the resulting cell (if any).
   * @param name optional name
   * @param noFail if true, then we know `computeFn` can't throw
   * @returns
   */
  map<D extends unknown[], V, NF extends boolean = false>(
    dependencies: AnyCellArray<D>,
    computeFn: (
      ...args: D | [...D, V]
    ) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF> {
    // @ts-expect-error conflict with overloaded definitions
    const cell = this._sheet.map(dependencies, computeFn, name, this, noFail);
    this._list.push(cell);
    this._sheet.addProxyDependencies(this._id, dependencies);
    return cell as MapCell<V, NF>;
  }

  /**
   * mapNoPrevious maps a list to cells to a new cells using the compute function.
   * @param dependencies list of existing cells
   * @param computeFn function to apply to cells values, without extra arguments
   * @param name optional name
   * @param noFail if true, then we know `computeFn` can't throw
   * @returns
   */
  mapNoPrevious<D extends unknown[], V, NF extends boolean = false>(
    dependencies: AnyCellArray<D>,
    computeFn: (...args: D) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF> {
    const cell = this._sheet.mapNoPrevious(
      dependencies,
      computeFn,
      name,
      this,
      noFail
    );
    this._list.push(cell);
    this._sheet.addProxyDependencies(this._id, dependencies);
    return cell;
  }

  get(id: number) {
    return this._sheet.get(id);
  }

  _update(id: number): Promise<void> | void {
    const release = this.working.startNewComputation();
    const computation = this._sheet._update(id);
    dispatch(computation, release);
    return computation;
  }

  equals<V>(a: V, b: V) {
    return this._sheet.equals(a, b);
  }

  get size() {
    // the special working cell is not in the list,
    // but we count it to be in sync with sheet.stats
    return this._list.length + 1;
  }

  wait() {
    return this.working.wait();
  }

  /**
   * destroy the Proxy and free memory.
   * @todo check for memory leaks
   */
  destroy() {
    // if (!this?._sheet) {
    //   throw new Error(`missing: ${this?._name}`);
    // }
    this._sheet.delete(...this._list);
    this._list = [];
  }
}
