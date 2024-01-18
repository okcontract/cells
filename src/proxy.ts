import { dispatch } from "./promise";
import { CellErrors, MapCell, ValueCell, Working, type AnyCell } from "./cell";
import { Sheet } from "./sheet";
import type { AnyCellArray } from "./types";

/**
 * SheetProxy is a proxy that automatically registers locally
 * created cells to delete them in a single call.
 */
export class SheetProxy {
  _sheet: Sheet;
  // @todo use
  // private _name: string;
  /** locally created cells */
  private _list: AnyCell<any>[];

  working: Working;

  /** Cell holding all the current "initial" errors of the proxy */
  public errors: CellErrors;

  constructor(sh: Sheet, name?: string) {
    if (!sh) {
      throw new Error("no sheet");
    }
    this._sheet = sh;
    // if (name) this._name = name;
    this._list = [];
    this.working = new Working(sh.working);

    this.errors = new CellErrors(sh.errors);
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

  // Implementation
  map<D extends any[], V, NF extends boolean = false>(
    dependencies: AnyCellArray<D>,
    computeFn: (...args: D) => V | Promise<V | AnyCell<V>> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF> {
    const cell = this._sheet.map(dependencies, computeFn, name, this, noFail);
    this._list.push(cell);
    return cell as MapCell<V, NF>;
  }

  // Implementation
  mapNoPrevious<D extends any[], V, NF extends boolean = false>(
    dependencies: AnyCellArray<D>,
    computeFn: (...args: D) => V | Promise<V> | AnyCell<V>,
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

  equals(a: any, b: any) {
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
