import { Cell } from "./cell";

/**
 * _uncellify is used in tests to flatten a value tree that contains multiple cells.
 * @param v any value
 * @returns value without cells
 */
export const _uncellify = async (v: any) => {
  const value = v instanceof Cell ? await v.get() : v;
  if (value instanceof Error) throw value;
  if (Array.isArray(value))
    return await Promise.all(
      value.map(async (_element) => await _uncellify(_element))
    );
  else if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, vv]) => [k, await _uncellify(vv)])
      )
    );
  return value;
};
