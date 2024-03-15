import type { AnyCell, MapCell, ValueCell } from "./cell";
import { collector } from "./gc";
import type { SheetProxy } from "./proxy";

// @todo introduce a type variable that is a sum type of all possible field types?
export type CellObject = AnyCell<Record<string, AnyCell<unknown>>>;

/**
 * mapObject applies a function to a CellObject.
 */
export const mapObject = <NF extends boolean = false>(
  proxy: SheetProxy,
  obj: CellObject,
  // @todo return type
  fn: (key: string, value: unknown) => unknown | Promise<unknown>,
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
            reuse ? prev[k] : proxy.map([v], (_v) => fn(k, _v), `[${k}]`)
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

export const reduceObject = <
  T,
  R extends unknown | Promise<unknown>,
  NF extends boolean = false
>(
  proxy: SheetProxy,
  obj: CellObject,
  fn: (acc: R, elt: [string, unknown], index?: number) => R,
  init: R,
  name = "reduceObject",
  nf?: NF
): MapCell<R, NF> => {
  const coll = collector<MapCell<R, NF>>(proxy);
  return proxy.map(
    [obj],
    (cells) => {
      const keys = Object.keys(cells);
      const values = Object.values(cells);
      return coll(
        proxy.mapNoPrevious(
          values,
          (..._cells) =>
            _cells.reduce(
              (acc, _cell, i) => fn(acc as R, [keys[i], _cell], i),
              init
            ),
          "_reduce"
        ) as MapCell<R, NF>
      );
    },
    name,
    nf
  );
};

export const cellifyObject = (
  proxy: SheetProxy,
  obj: AnyCell<Record<string, unknown>>,
  name = "çObj"
): MapCell<CellObject, true> => {
  const set = <T>(c: ValueCell<T>, v: T): ValueCell<T> => {
    c.set(v);
    return c;
  };
  return proxy.map(
    [obj],
    (_obj, prev) => {
      // @todo delete unused cells
      return Object.fromEntries(
        Object.entries(_obj).map(([k, v]) => [
          k,
          prev?.[k] ? set(prev[k], v) : proxy.new(v)
        ])
      );
    },
    name,
    true
  );
};
