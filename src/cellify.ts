import { AnyCell, Cell, ValueCell } from "./cell";

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
    ? U extends Array<any>
      ? Array<Uncellified<U[number]>>
      : {
          [P in keyof U]: Uncellified<U[P]>;
        }
    : U
  : T;

/**
 * _uncellify is used in tests to flatten a value tree that contains multiple cells.
 * @param v any value
 * @returns value without cells
 */
export const _uncellify = async <T>(
  v: T | AnyCell<T>
): Promise<Uncellified<T>> => {
  const value = v instanceof Cell ? await v.get() : v;
  if (value instanceof Error) throw value;
  if (Array.isArray(value))
    return Promise.all(
      value.map(async (_element) => await _uncellify(_element))
    ) as Promise<Uncellified<T>>;
  else if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, vv]) => [k, await _uncellify(vv)])
      )
    );
  return value as Uncellified<T>;
};
