import { type AnyCell, type MapCell, ValueCell } from "./cell";
import { collector, reuseOrCreate } from "./gc";
import type { SheetProxy } from "./proxy";

export type CellArray<T> = AnyCell<AnyCell<T>[]>;

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
  arr: CellArray<T>,
  fn: (v: T, index?: number) => U | Promise<U | AnyCell<U>> | AnyCell<U>,
  name = "map"
): MapCell<MapCell<U, false>[], false> =>
  proxy.map(
    [arr],
    (cells, prev) => {
      const set = new Set((prev || []).map((cell) => cell.id));
      const res = cells.map((cell, index) => {
        // reuse previously mapped cell
        const reuse = prev?.find((_c) => _c.dependencies?.[0] === cell.id);
        if (reuse !== undefined) set.delete(reuse.id);
        return (
          reuse ||
          // create new map
          proxy.map([cell], (_cell) => fn(_cell, index), `[${index}]`)
        );
      });
      // collect unused previously mapped cells
      proxy._sheet.collect(...[...set]);
      return res;
    },
    name
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
  arr: CellArray<T>,
  compare: (a: T, b: T) => number = (a, b) => (a > b ? 1 : a < b ? -1 : 0)
): CellArray<T> => {
  const coll = collector<CellArray<T>>(proxy);
  return proxy.map(
    [arr],
    (cells) =>
      coll(
        proxy.mapNoPrevious(
          cells,
          (..._cells) =>
            _cells
              .map((_, index) => index)
              .sort((indexA, indexB) => compare(_cells[indexA], _cells[indexB]))
              .map((index) => cells[index]),
          "_sort"
        )
      ),
    "sort"
  );
};

/**
 * mapArrayCell is a variant of `mapArray` with a function taking
 * element cells as arguments.
 * @param proxy
 * @param arr
 * @param fn
 * @returns mapped array cell
 */
export const mapArrayCell = <T, U, NF extends boolean = false>(
  proxy: SheetProxy,
  arr: CellArray<T>,
  fn: AnyCell<(v: AnyCell<T>, idx?: number) => AnyCell<U>>,
  name = "map",
  nf?: NF
): MapCell<MapCell<U, NF>[], NF> => {
  let prevFn: (v: AnyCell<T>) => AnyCell<U>;
  return proxy.map(
    [arr, fn],
    (cells, _fn, prev) => {
      const arr = cells.map((cell, i) =>
        // @todo collect previously mapped cells
        reuseOrCreate(
          _fn === prevFn, // function unchanged
          () => prev?.find((_c) => _c.dependencies?.[0] === cell.id), // reuse
          () => _fn(cell, i) as MapCell<U, NF> // create new map
        )
      );
      prevFn = _fn;
      return arr;
    },
    name,
    nf
  );
};

/**
 * first element of recursive arrays.
 */
export const first = <T>(
  proxy: SheetProxy,
  arr: AnyCell<T | AnyCell<T>[]>,
  name = "last"
): MapCell<T, boolean> => {
  // @todo collectors (on path?)
  const aux = (arr: AnyCell<T | AnyCell<T>[]>) =>
    proxy.mapNoPrevious(
      [arr],
      (_arr) => {
        if (!Array.isArray(_arr)) return arr as AnyCell<T>;
        if (_arr.length === 0) return null; // @todo pointer to nullCell?
        return aux(_arr[0]);
      },
      name
    );
  return aux(arr);
};

/**
 * last element of recursive arrays.
 */
export const last = <T>(
  proxy: SheetProxy,
  arr: AnyCell<T | AnyCell<T>[]>,
  name = "last"
): MapCell<T, boolean> => {
  // @todo collectors (on path?)
  const aux = (arr: AnyCell<T | AnyCell<T>[]>) =>
    proxy.mapNoPrevious(
      [arr],
      (_arr) => {
        if (Array.isArray(_arr)) return aux(_arr[_arr.length - 1]);
        return arr as AnyCell<T>;
      },
      name
    );
  return aux(arr);
};

/**
 * reduce a cellified array.
 * @param proxy
 * @param arr
 * @param fn
 * @param init
 * @returns reduced cell
 */
export const reduce = <
  T,
  R extends unknown | Promise<unknown>,
  NF extends boolean = false
>(
  proxy: SheetProxy,
  arr: CellArray<T>,
  fn: (acc: R, elt: T, index?: number, length?: number) => R,
  init: R,
  name = "reduce",
  nf?: NF
): MapCell<R, NF> => {
  const coll = collector<MapCell<R, NF>>(proxy);
  return proxy.map(
    [arr],
    (cells) =>
      coll(
        proxy.mapNoPrevious(
          cells,
          (..._cells) =>
            _cells.reduce(
              (acc, elt, i) => fn(acc, elt, i, _cells.length),
              init
            ),
          "_reduce"
        )
      ),
    name,
    nf
  );
};

export const find = <T, NF extends boolean = false>(
  proxy: SheetProxy,
  arr: CellArray<T>,
  predicate: (v: T) => boolean,
  name = "find",
  nf?: NF
) => {
  const coll = collector<MapCell<T, NF>>(proxy);
  return proxy.map(
    [arr],
    (cells) =>
      coll(proxy.mapNoPrevious(cells, (..._cells) => _cells.find(predicate))),
    name,
    nf
  );
};

// @todo generalize
export const findCell = <T, NF extends boolean = false>(
  proxy: SheetProxy,
  arr: CellArray<T>,
  predicate: AnyCell<(v: AnyCell<T>) => AnyCell<boolean>>,
  name = "find",
  nf?: NF
) => {
  const coll = collector<MapCell<T, NF>>(proxy);
  // Since predicate is a reactive function, we have to instantiate
  // the computation for each cell.
  // const keep = mapArrayCell(proxy, arr, predicate, "keep", nf);
  let prevFn: (elt: AnyCell<T>) => AnyCell<boolean>;
  const keep = proxy.map(
    [predicate, arr],
    (fn, cells, _prev: AnyCell<boolean>[]) => {
      // console.log({ keep: cells.length });
      // @todo if the predicate function has changed, collect previous mapped cells
      const keep = cells.map((cell) => {
        // We can reuse a cell only if the predicate hasn't changed.
        // @todo collect previously mapped cells for deleted cells in arr
        const reuse =
          prevFn === fn &&
          _prev?.find((_c) => _c.dependencies?.[0] === cell.id);
        return reuse || fn(cell);
      });
      prevFn = fn;
      return keep;
    },
    "keep",
    nf
  );
  return proxy.map(
    [arr, keep],
    (cells, _keep) =>
      coll(
        proxy.mapNoPrevious(_keep, (..._flat) => cells.find((_, i) => _flat[i]))
      ),
    name,
    nf
  );
};

export const findIndex = <T, NF extends boolean = false>(
  proxy: SheetProxy,
  arr: CellArray<T>,
  fn: (v: T) => boolean,
  name = "find",
  nf?: NF
) => {
  const coll = collector<MapCell<number, NF>>(proxy);
  return proxy.map(
    [arr],
    (cells) =>
      coll(proxy.mapNoPrevious(cells, (..._cells) => _cells.findIndex(fn))),
    name,
    nf
  );
};

/**
 * filter updates a cellified array in a `ValueCell` using a predicate function as filter.
 * @param arr
 * @param predicate function that returns `true` for kept values.
 * @returns nothing
 * @description filtered out cells are _not_ deleted
 */
export const filter = <T, NF extends boolean = false>(
  proxy: SheetProxy,
  predicate: AnyCell<(elt: T) => boolean>,
  arr: CellArray<T>,
  name = "filter",
  nf?: NF
) => {
  const coll = collector<MapCell<AnyCell<T>[], NF>>(proxy);
  return proxy.map(
    [predicate, arr],
    (fn, cells) =>
      coll(
        proxy.mapNoPrevious(
          cells,
          (..._cells) => cells.filter((_, i) => fn(_cells[i])),
          "_filter"
        )
      ),
    name,
    nf
  );
};

export const mapFlat = <T, NF extends boolean = false>(
  proxy: SheetProxy,
  arr: CellArray<T>,
  name = "flatten",
  nf?: NF
) => {
  const coll = collector<MapCell<T[], NF>>(proxy);
  return proxy.map(
    [arr],
    (cells) => coll(proxy.mapNoPrevious(cells, (..._cells) => _cells)),
    name,
    nf
  );
};

/**
 * filterPredicateCell updates a cellified array in a `ValueCell` using a predicate function as filter.
 * @param arr
 * @param predicate as Cell function that returns `true` for kept values.
 * @returns nothing
 * @description filtered out cells are _not_ deleted
 */
export const filterPredicateCell = <T, NF extends boolean = false>(
  proxy: SheetProxy,
  predicate: AnyCell<(elt: AnyCell<T>) => AnyCell<boolean>>,
  arr: CellArray<T>,
  name = "filter",
  nf?: NF
) => {
  const coll = collector<MapCell<AnyCell<T>[], NF>>(proxy);
  // Since predicate is a reactive function, we have to instantiate
  // the computation for each cell.
  // const keep = mapArrayCell(proxy, arr, predicate, "keep", nf);
  let prevFn: (elt: AnyCell<T>) => AnyCell<boolean>;
  const keep = proxy.map(
    [predicate, arr],
    (fn, cells, _prev: AnyCell<boolean>[]) => {
      // console.log({ keep: cells.length });
      // @todo if the predicate function has changed, collect previous mapped cells
      const keep = cells.map((cell) => {
        // We can reuse a cell only if the predicate hasn't changed.
        // @todo collect previously mapped cells for deleted cells in arr
        const reuse =
          prevFn === fn &&
          _prev?.find((_c) => _c.dependencies?.[0] === cell.id);
        return reuse || fn(cell);
      });
      prevFn = fn;
      return keep;
    },
    "keep",
    nf
  );
  return proxy.map(
    [arr, keep],
    (cells, _keep) =>
      coll(
        proxy.mapNoPrevious(
          _keep,
          (..._flat) => cells.filter((_, i) => _flat[i]),
          "filter.map"
        )
      ),
    name,
    nf
  );
};
