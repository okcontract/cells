import { type CellArray, mapArray } from "./array";
import { type AnyCell, Cell, type MapCell, type ValueCell } from "./cell";
import { collector } from "./gc";
import { type CellObject, mapObject } from "./object";
import type { SheetProxy } from "./proxy";

export type Path = (string | number)[];

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

// @todo is type only if true
// exclude classes
export const isObject = <K extends string | number | symbol>(
  v: unknown
): v is Record<K, unknown> =>
  typeof v === "object" && v !== null && v.constructor?.name === "Object";

/**
 * cellify converts any value to a Cellified value where each array or record
 * becomes a Cell in canonical form.
 * @param proxy
 * @param v any defined value (v must not be undefined)
 * @returns
 * @todo cell reuses
 */
export const cellify = <T>(proxy: SheetProxy, v: T): Cellified<T> => {
  if (v instanceof Cell) throw new Error("cell");
  return proxy.new(
    Array.isArray(v)
      ? v.map((vv) => cellify(proxy, vv))
      : isObject(v)
        ? Object.fromEntries(
            Object.entries(v).map(([k, vv]) => [k, cellify(proxy, vv)])
          )
        : v,
    v?.constructor?.name ? `ç(${v.constructor.name})` : `c(${typeof v})`
  ) as Cellified<T>;
};

/**
 * _uncellify is used in tests to flatten a value tree that contains multiple cells.
 * @param v any value
 * @returns value without cells
 */
export const uncellify = async <T>(
  v: T | AnyCell<T>,
  filter: {
    excludePaths: Path[];
    currentPath: Path;
  } = { excludePaths: [], currentPath: [] }
): Promise<Uncellified<T>> => {
  const isFiltered = (path: Path, excludePaths: Path[]): boolean =>
    excludePaths.some(
      (excludePath) =>
        excludePath.length === path.length &&
        excludePath.every((p, index) => p === path[index])
    );
  if (isFiltered(filter.currentPath, filter.excludePaths))
    return v as Uncellified<T>;
  const value = v instanceof Cell ? await v.consolidatedValue : v;
  if (value instanceof Error) throw value;
  if (Array.isArray(value))
    return Promise.all(
      value.map(
        async (element, index) =>
          await uncellify(element, {
            excludePaths: filter.excludePaths,
            currentPath: filter.currentPath.concat(index)
          })
      )
    ) as Promise<Uncellified<T>>;

  if (isObject(value))
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, vv]) => [
          k,
          await uncellify(vv, {
            excludePaths: filter.excludePaths,
            currentPath: filter.currentPath.concat(k)
          })
        ])
      )
    );

  // Classes, null or base types (string, number, ..)
  return value as Uncellified<T>;
};

/**
 * follow a static path for a Cellified value.
 */
export const follow = (
  proxy: SheetProxy,
  v: Cellified<unknown>,
  path: Path,
  name = "follow"
) => {
  const aux = (v: Cellified<unknown>, path: Path, name: string) => {
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
        return _v; // pointer
      },
      name
    );
  };
  return aux(v, path, name);
};

export const pathsTree = (proxy, v) =>
  mapPartialTree(proxy, v, (path, _) => path);

export const mapPartialTree = (
  proxy: SheetProxy,
  v: Cellified<Record<string, unknown>>,
  fn: (path: Path, v: unknown) => unknown
) => {
  // @todo collector at all levels?
  // step 1: compute paths
  const pathTreeAux = (
    v: Cellified<unknown>,
    path: Path,
    name = "path"
  ): MapCell<unknown, false> => {
    console.log({ aux: path, v: v !== undefined });
    const coll = collector<MapCell<unknown, false>>(proxy);
    // if (!v) throw new Error("arg");
    return proxy.map(
      [v],
      (_v, prev) => {
        if (prev) return prev;

        if (Array.isArray(_v)) {
          return (
            v.pointed ||
            mapArray(
              proxy,
              v as CellArray<unknown>,
              (_, i) =>
                coll(pathTreeAux(_v[i], [...path, i], [...path, i].join(":"))),
              "path[]"
            )
          );
        }
        if (isObject(_v)) {
          return v.pointed
            ? proxy.get(v.pointed)
            : mapObject(
                proxy,
                v as CellObject<unknown>,
                (fk, _, fv) => {
                  // const fv = fv2 _v[fk];
                  console.log({
                    fk,
                    fv: fv?.constructor?.name
                    // fv2: fv2?.constructor?.name
                  });
                  return coll(
                    pathTreeAux(
                      fv as ValueCell<unknown>,
                      [...path, fk],
                      [...path, fk].join(":")
                    )
                  );
                },
                "path{}"
              );
        }
        return proxy.new(fn(path, _v), `leaf:${path.join(".")}`); // leaf
      },
      name
    );
  };
  const pt = pathTreeAux(v, [], "root");

  // step 2: flatten
  return pt;
};
