import type { SheetProxy } from "./proxy";
import type { AnyCell, MapCell } from "./cell";

/**
 * mapArray implements .map() for a cellified array.
 *
 * @param proxy
 * @param arr canonical form cell array
 * @param fn to map each element cell
 * @returns mapped array cell
 *
 * @description This function reuses existing mapped cells.
 * @todo Delete unused mapped cells
 */
export const mapArray = <T, U>(
  proxy: SheetProxy,
  arr: AnyCell<AnyCell<T>[]>,
  fn: (v: T) => U
): MapCell<MapCell<U, false>[], false> =>
  proxy.map([arr], (cells, prev) =>
    cells.map(
      (cell) =>
        // reuse previously mapped cell
        prev?.find((_c) => _c.dependencies?.[0] === cell.id) ||
        // create new map
        proxy.map([cell], fn)
    )
  );

/**
 * mapArrayCell is a variant of `mapArray` with a function taking
 * element cells as arguments.
 * @param proxy
 * @param arr
 * @param fn
 * @returns mapped array cell
 */
export const mapArrayCell = <T, U>(
  proxy: SheetProxy,
  arr: AnyCell<AnyCell<T>[]>,
  fn: (v: AnyCell<T>) => U
): MapCell<MapCell<U, false>[], false> =>
  proxy.map([arr], (cells, prev) =>
    cells.map(
      (cell) =>
        // reuse previously mapped cell
        prev?.find((_c) => _c.dependencies?.[0] === cell.id) ||
        // create new map
        proxy.map([cell], (_) => fn(cell))
    )
  );

/**
 * reduce a cellified array.
 * @param proxy
 * @param arr
 * @param fn
 * @param init
 * @returns reduced cell
 */
export const reduce = <T, R>(
  proxy: SheetProxy,
  arr: AnyCell<AnyCell<T>[]>,
  fn: (acc: R, elt: T) => R,
  init: R
): MapCell<R, false> =>
  proxy.map([arr], (cells) =>
    // this creates a pointer cell
    proxy.mapNoPrevious(cells, (..._cells) => _cells.reduce(fn, init))
  );
