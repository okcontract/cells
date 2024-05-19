import {
  type AnyCell,
  Cell,
  type CellResult,
  type MapCell,
  type Pending,
  type ValueCell
} from "./cell";
import { collector } from "./gc";
import type { SheetProxy } from "./proxy";

// Cellified computes a cellified type.
export type Cellified<T> = T extends object
  ? T extends Array<infer U>
    ? ValueCell<Cellified<U>[]>
    : ValueCell<{
        [P in keyof T]: Cellified<T[P]>;
      }>
  : ValueCell<T>;

// Uncellified computes an uncellified type.
export type Uncellified<T> = T extends AnyCell<infer U>
  ? U extends object
    ? U extends Array<infer Elt>
      ? Array<Uncellified<Elt>>
      : {
          [P in keyof U]: Uncellified<U[P]>;
        }
    : U
  : T;

// isObject returns true if the value is a regular JavaScript Object,
// but not null neither a custom Class instance.
export const isObject = <K extends string | number | symbol>(
  v: unknown
): v is Record<K, unknown> =>
  typeof v === "object" && v !== null && v.constructor?.name === "Object";

const errIsCell = new Error("value is cell");

/**
 * cellify converts any value to a Cellified value where each array or record
 * becomes a Cell in canonical form.
 * @param proxy
 * @param v any defined value (v must not be undefined)
 * @returns
 * @todo cell reuses
 */
export const cellify = <T>(
  proxy: SheetProxy,
  v: T,
  name = "ç",
  failOnCell = false
): Cellified<T> => {
  if (v instanceof Cell) {
    if (failOnCell) throw errIsCell;
    return v as Cellified<T>;
  }
  return proxy.new(
    Array.isArray(v)
      ? v.map((vv, i) => cellify(proxy, vv, `${name}[${i}]`, failOnCell), "ç[]")
      : isObject(v)
        ? Object.fromEntries(
            Object.entries(v).map(
              ([k, vv]) => [k, cellify(proxy, vv, `${name}[${k}]`, failOnCell)],
              "ç{}"
            )
          )
        : v,
    name
  ) as Cellified<T>;
};

export type UncellifyOptions = {
  getter: <T>(c: AnyCell<T>) => Pending<T, boolean> | CellResult<T, boolean>;
};

/**
 * uncellify is used in tests to flatten a value tree that contains multiple cells.
 * @param v any value
 * @returns value without cells
 */
export const uncellify = async <T>(
  v: T | AnyCell<T>,
  options: UncellifyOptions = { getter: (cell) => cell.value }
): Promise<Uncellified<T>> => {
  const value = v instanceof Cell ? await options.getter(v) : v;
  if (value instanceof Error) throw value;
  if (Array.isArray(value))
    return Promise.all(
      value.map((_element) => uncellify(_element, options))
    ) as Promise<Uncellified<T>>;
  if (isObject(value))
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, vv]) => [
          k,
          await uncellify(vv, options)
        ])
      )
    );
  // Classes, null or base types (string, number, ...)
  return value as Uncellified<T>;
};

export type Key = string | number;
export type Path = Key[];

/**
 * follow a static path for a Cellified value.
 */
export const follow = (
  proxy: SheetProxy,
  v: AnyCell<unknown>,
  path: Path,
  name = "follow"
) => {
  const aux = (v: AnyCell<unknown>, path: Path, name: string) => {
    // @todo multi collector?
    const coll = collector<MapCell<unknown, false>>(proxy);
    return proxy.map(
      [v],
      (_v) => {
        const key = path[0];
        const isContainer = Array.isArray(_v) || isObject(_v);
        if (isContainer && _v[key])
          return coll(aux(_v[key], path.slice(1), `${name}.${key}`));
        if (isContainer) throw new Error(`path not found: ${key}`);
        return v; // pointer
      },
      name
    );
  };
  return aux(v, path, name);
};
