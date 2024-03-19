import { Cell } from "./cell";
/**
 * cellify converts any value to a Cellified value where each array or record
 * becomes a Cell in canonical form.
 * @param proxy
 * @param v any defined value (v must not be undefined)
 * @returns
 * @todo cell reuses
 */
export const _cellify = (proxy, v) => {
    if (v instanceof Cell)
        throw new Error("cell");
    return proxy.new(Array.isArray(v)
        ? v.map((vv) => _cellify(proxy, vv), "cellify.[]")
        : typeof v === "object" &&
            v !== null &&
            v.constructor.prototype === Object.prototype // exclude classes
            ? Object.fromEntries(Object.entries(v).map(([k, vv]) => [k, _cellify(proxy, vv)], "cellify.{}"))
            : v, "cellify");
};
/**
 * _uncellify is used in tests to flatten a value tree that contains multiple cells.
 * @param v any value
 * @returns value without cells
 */
export const _uncellify = async (v) => {
    const value = v instanceof Cell ? await v.get() : v;
    if (value instanceof Error)
        throw value;
    if (Array.isArray(value))
        return Promise.all(value.map(async (_element) => await _uncellify(_element)));
    if (typeof value === "object" &&
        value !== null &&
        value.constructor.prototype === Object.prototype // exclude classes
    )
        return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, vv]) => [k, await _uncellify(vv)])));
    // Classes, null or base types (string, number, ...)
    return value;
};
