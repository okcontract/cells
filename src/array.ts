import type { AnyCell, MapCell, ValueCell } from "./cell";
import { filterAsync } from "./filter-async";
import type { SheetProxy } from "./proxy";

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
 * implementation of sort for a cellified array.
 * @description this implementation relies on pointers but reuses the original cells.
 * @param proxy
 * @param arr
 * @param compare comparison function
 */
export const sort = <T>(
  proxy: SheetProxy,
  arr: AnyCell<AnyCell<T>[]>,
  compare: (a: T, b: T) => number = (a, b) => (a > b ? 1 : a < b ? -1 : 0)
): AnyCell<AnyCell<T>[]> =>
  proxy.map([arr], (cells) =>
    proxy.mapNoPrevious(cells, (..._cells) =>
      _cells
        .map((_, index) => index)
        .sort((indexA, indexB) => compare(_cells[indexA], _cells[indexB]))
        .map((index) => cells[index])
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

/**
 * filter updates a cellified array in a `ValueCell` using a predicate function as filter.
 * @param arr
 * @param predicate function that returns `true` for kept values.
 * @returns nothing
 * @description filtered out cells are _not_ deleted
 */
export const filter = <T>(
  arr: ValueCell<AnyCell<T>[]>,
  predicate: (elt: T) => boolean
) =>
  arr.update(async (items) =>
    filterAsync(items, async (item) => {
      const v = await item.get();
      // we keep errors
      return v instanceof Error || predicate(v);
    })
  );
