import type { CellResult, MapCell, ValueCell } from "./cell";
import type { SheetProxy } from "./proxy";

/**
 * WrappedCell is a Cell, where subsequent calls to `.map()` use a different
 * proxy than the cell proxy.
 *
 * This is useful when we want to keep a cache of cells, and locally creating
 * mapped values from the cache.
 */
export class WrappedCell<V> {
  _cell: ValueCell<V>;
  _proxy: SheetProxy;
  constructor(cell: ValueCell<V>, proxy: SheetProxy) {
    this._cell = cell;
    this._proxy = proxy;
  }

  get value() {
    return this._cell.value;
  }
  get cell() {
    return this._cell;
  }

  get working(): Promise<void> {
    return this._cell.working;
  }

  public get = () => this._cell.get();

  public set = (value: V | Promise<V>): void | Promise<void> =>
    this._cell.set(value);

  public map = <T, NF extends boolean>(
    fn: (v: V) => T | Promise<T>,
    name?: string,
    noFail?: NF
  ): MapCell<T, NF> => this._proxy.map([this._cell], fn, name, noFail);

  public subscribe = (
    runRaw: (value: CellResult<V, false>) => void,
    invalidate?: (value?: V) => void
  ) => this._cell.subscribe(runRaw, invalidate);
}
