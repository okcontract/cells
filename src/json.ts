import { Cell } from "./cell";

const errorCell = new Error("cell");

/**
 * jsonStringify is a custom stringify.
 * @param obj
 * @returns
 */
export const jsonStringify = <T>(obj: T) => {
  if (obj instanceof Cell) throw errorCell;
  let out = "";
  const aux = <T>(v: T) => {
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
        out += "{";
        let first = true;
        // sort objects alphabetically
        for (const [k, elt] of Object.entries(v).sort(([k1, _v1], [k2, _v2]) =>
          k1 < k2 ? -1 : k1 > k2 ? 1 : 0
        )) {
          if (elt === undefined || elt === null) continue;
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
        out += `"${v.toString()}"`;
        break;
      // case "boolean":
      //   out += v ? "true" : "false";
      //   break;
      default:
        out += JSON.stringify(v);
    }
  };
  aux(obj);
  return out;
};
