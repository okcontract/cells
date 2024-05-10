import { Cell } from "./cell";
import { isObject } from "./cellify";

const errorCell = new Error("cell");

/**
 * jsonStringify is a custom stringify.
 * @param obj
 * @returns
 */
export const jsonStringify = <T>(
  obj: T,
  options: { skipNull?: boolean; failOnCell?: boolean } = {}
) => {
  let out = "";
  const aux = <T>(v: T) => {
    if (v instanceof Cell) {
      if (options?.failOnCell) throw errorCell;
      return aux(v.value);
    }
    if (Array.isArray(v)) {
      out += "[";
      let first = true;
      for (const elt of v) {
        if (!first) out += ",";
        aux(elt);
        first = false;
      }
      out += "]";
      return;
    }
    switch (typeof v) {
      case "object": {
        if (v === null) {
          out += "null";
          break;
        }
        // use toString for classes
        if (!isObject(v)) out += JSON.stringify(v.toString());
        out += "{";
        let first = true;
        // sort objects alphabetically
        for (const [k, elt] of Object.entries(v).sort(([k1, _v1], [k2, _v2]) =>
          k1 < k2 ? -1 : k1 > k2 ? 1 : 0
        )) {
          if (elt === undefined || (options.skipNull && elt === null)) continue;
          if (!first) out += ",";
          out += JSON.stringify(k);
          out += ":";
          aux(elt);
          first = false;
        }
        out += "}";
        break;
      }
      case "function":
      case "symbol":
        break;
      case "bigint":
        out += v < 1_000_000n ? Number(v) : `"${v.toString()}"`;
        break;
      default:
        out += JSON.stringify(v);
    }
  };
  aux(obj);
  return out;
};
