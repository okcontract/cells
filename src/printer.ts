import { Cell } from "./cell";
import { isObject } from "./cellify";

export type SimplifierOptions = {
  /** max rank shown */
  maxRank?: number;
  /** resolve pointers until given rank */
  resolvePointers?: number;
};

export const defaultSimplifierOptions: SimplifierOptions = {
  maxRank: 6,
  resolvePointers: 4
};

export const simplifier = (
  v: unknown,
  rank = 1,
  options = defaultSimplifierOptions
) =>
  options.maxRank && rank > options.maxRank
    ? { "...": true }
    : v instanceof Cell
      ? options.resolvePointers && rank <= options.resolvePointers
        ? { [`ç[${v.id}]`]: simplifier(v.value, rank + 1, options) }
        : { cell: v.id }
      : Array.isArray(v)
        ? v.map((x) => simplifier(x, rank + 1, options))
        : isObject(v)
          ? Object.fromEntries(
              Object.entries(v).map(([k, v]) => [
                k,
                simplifier(v, rank + 1, options)
              ])
            )
          : v;
