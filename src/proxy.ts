import { dispatch } from "./promise";
import { CellErrors, MapCell, ValueCell, Working, type AnyCell } from "./cell";
import { Sheet } from "./sheet";
import type { ExtractTypes, UnwrapCell } from "./types";

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
    value: V | Promise<V>,
    name?: string, // @todo migrate to options
    options?: { name?: string; _storageKey?: string }
  ): ValueCell<V> {
    const cell = this._sheet.new(value, this, name, options);
    // using the fact that if value is a pending promise,
    // consolidated value will resolve when value is resolved.
    this.working.addComputation(cell.id, cell.consolidatedValue);
    this._list.push(cell);
    return cell;
  }

  // @todo Dirty hack to overload map to fix type inference
  // for variadic kinds.
  map<D1 extends AnyCell<any>, V, NF extends boolean>(
    dependencies: [D1],
    computeFn: (arg1: UnwrapCell<D1>, prev?: V) => V | Promise<V> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF>;

  // @todo Dirty hack to overload map to fix type inference
  // for variadic kinds.
  map<D1 extends AnyCell<any>, D2 extends AnyCell<any>, V, NF extends boolean>(
    dependencies: [D1, D2],
    computeFn: (
      arg1: UnwrapCell<D1>,
      arg2: UnwrapCell<D2>,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF>;

  // @todo Dirty hack to overload map to fix type inference
  // for variadic kinds.
  map<
    D1 extends AnyCell<any>,
    D2 extends AnyCell<any>,
    D3 extends AnyCell<any>,
    V,
    NF extends boolean
  >(
    dependencies: [D1, D2, D3],
    computeFn: (
      arg1: UnwrapCell<D1>,
      arg2: UnwrapCell<D2>,
      arg3: UnwrapCell<D3>,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF>;

  map<
    D1 extends AnyCell<any>,
    D2 extends AnyCell<any>,
    D3 extends AnyCell<any>,
    D4 extends AnyCell<any>,
    V,
    NF extends boolean
  >(
    dependencies: [D1, D2, D3, D4],
    computeFn: (
      arg1: UnwrapCell<D1>,
      arg2: UnwrapCell<D2>,
      arg3: UnwrapCell<D3>,
      arg4: UnwrapCell<D4>,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF>;

  map<
    D1 extends AnyCell<any>,
    D2 extends AnyCell<any>,
    D3 extends AnyCell<any>,
    D4 extends AnyCell<any>,
    D5 extends AnyCell<any>,
    V,
    NF extends boolean
  >(
    dependencies: [D1, D2, D3, D4, D5],
    computeFn: (
      arg1: UnwrapCell<D1>,
      arg2: UnwrapCell<D2>,
      arg3: UnwrapCell<D3>,
      arg4: UnwrapCell<D4>,
      arg5: UnwrapCell<D5>,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF>;

  map<
    D1 extends AnyCell<any>,
    D2 extends AnyCell<any>,
    D3 extends AnyCell<any>,
    D4 extends AnyCell<any>,
    D5 extends AnyCell<any>,
    D6 extends AnyCell<any>,
    V,
    NF extends boolean
  >(
    dependencies: [D1, D2, D3, D4, D5, D6],
    computeFn: (
      arg1: UnwrapCell<D1>,
      arg2: UnwrapCell<D2>,
      arg3: UnwrapCell<D3>,
      arg4: UnwrapCell<D4>,
      arg5: UnwrapCell<D5>,
      arg6: UnwrapCell<D6>,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF>;

  map<
    D1 extends AnyCell<any>,
    D2 extends AnyCell<any>,
    D3 extends AnyCell<any>,
    D4 extends AnyCell<any>,
    D5 extends AnyCell<any>,
    D6 extends AnyCell<any>,
    D7 extends AnyCell<any>,
    V,
    NF extends boolean
  >(
    dependencies: [D1, D2, D3, D4, D5, D6, D7],
    computeFn: (
      arg1: UnwrapCell<D1>,
      arg2: UnwrapCell<D2>,
      arg3: UnwrapCell<D3>,
      arg4: UnwrapCell<D4>,
      arg5: UnwrapCell<D5>,
      arg6: UnwrapCell<D6>,
      arg7: UnwrapCell<D7>,
      prev?: V
    ) => V | Promise<V> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF>;

  // Implementation
  map<D extends AnyCell<any>[], V, NF extends boolean>(
    dependencies: D,
    computeFn: (...args: ExtractTypes<D>) => V | Promise<V> | AnyCell<V>,
    name?: string,
    noFail?: NF
  ): MapCell<V, NF> {
    // @ts-expect-error @todo dependencies
    const cell = this._sheet.map(dependencies, computeFn, name, this, noFail);
    this._list.push(cell);
    // if (name) {
    //   cell.bless(name);
    //   // console.log(`Cell ${cell.id} name is ${name}`);
    // }
    return cell;
  }

  // Implementation
  mapNoPrevious<D extends AnyCell<any>[], V, NF extends boolean>(
    dependencies: D,
    computeFn: (...args: ExtractTypes<D>) => V | Promise<V> | AnyCell<V>,
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
    // if (name) {
    //   cell.bless(name);
    //   // console.log(`Cell ${cell.id} name is ${name}`);
    // }
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
