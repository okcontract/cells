import type { AnyCell, MapCell } from "./cell";
import { collector } from "./gc";
import type { SheetProxy } from "./proxy";

// @todo introduce a type variable that is a sum type of all possible field types?
export type CellObject<T> = AnyCell<Record<string, AnyCell<T>>>;

/**
 * mapObject applies a function to a CellObject.
 */
export const mapObject = <NF extends boolean = false>(
  proxy: SheetProxy,
  obj: CellObject<unknown>,
  // @todo return type
  fn: (
    key: string,
    value: unknown,
    valueCell: AnyCell<unknown>
  ) => unknown | Promise<unknown>,
  name = "mapObject",
  nf?: NF
): MapCell<Record<string, AnyCell<unknown>>, NF> =>
  proxy.map(
    [obj],
    (cells, prev) => {
      const set = new Set(Object.keys(prev || {}));
      const res = Object.fromEntries(
        Object.entries(cells).map(([k, v]) => {
          // we reuse a previous cell if the key is the same and still maps to same v
          const reuse =
            (prev?.[k] && prev[k].dependencies?.[0] === v.id) || false;
          if (reuse) set.delete(k);
          // console.log({ k, reuse, prev: prev?.[k]?.id });
          return [
            k,
            reuse ? prev[k] : proxy.map([v], (_v) => fn(k, _v, v), `[${k}]µ`)
          ];
        })
      );
      // collect unused previously mapped cells
      proxy._sheet.collect(...[...set].map((k) => prev[k]));
      return res;
    },
    name,
    nf
  );

export const asyncReduce = async <T, U>(
  array: T[],
  reducer: (
    accumulator: U,
    currentValue: T,
    currentIndex: number,
    array: T[]
  ) => U | Promise<U>,
  initialValue: U
): Promise<U> => {
  let acc: U = initialValue;
  for (let index = 0; index < array.length; index++) {
    acc = await reducer(acc, array[index], index, array);
  }
  return acc;
};

/**
 * reduceObject applies the reducer function `fn` for each
 * element in `obj`, starting from `init` value.
 */
export const reduceObject = <T, R, NF extends boolean = false>(
  proxy: SheetProxy,
  obj: CellObject<T>,
  fn: (
    acc: R,
    key: string,
    value: T,
    cell?: AnyCell<T>,
    index?: number
  ) => R | Promise<R>,
  init: R,
  name = "reduceObject",
  nf?: NF
): MapCell<R, NF> => {
  const coll = collector<MapCell<R, NF>>(proxy);
  return proxy.mapNoPrevious(
    [obj],
    (cells) => {
      const keys = Object.keys(cells);
      const values = Object.values(cells);
      // console.log({ reduce: keys, name, count: proxy._sheet.stats.count });
      return coll(
        proxy.mapNoPrevious(
          values,
          (..._cells) =>
            asyncReduce(
              _cells,
              (acc, _cell, i) => fn(acc, keys[i], _cell, values[i], i),
              init
            ),
          "_reduce"
        )
      );
    },
    name,
    nf
  );
};
