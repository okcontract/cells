import { collector, reuseOrCreate } from "./gc";
/**
 * mapArray implements .map() for a cellified array.
 *
 * @param proxy
 * @param arr canonical form cell array
 * @param fn to map each element cell
 * @returns mapped array cell
 *
 * @description This function reuses existing mapped cells.
 * @todo Delete unused mapped cells
 */
export const mapArray = (proxy, arr, fn, name = "map") => proxy.map([arr], (cells, prev) => {
    const set = new Set((prev || []).map((cell) => cell.id));
    const res = cells.map((cell, index) => {
        // reuse previously mapped cell
        const reuse = prev?.find((_c) => _c.dependencies?.[0] === cell.id);
        if (reuse !== undefined)
            set.delete(reuse.id);
        return (reuse ||
            // create new map
            proxy.map([cell], (_cell) => fn(_cell, index), `[${index}]`));
    });
    // collect unused previously mapped cells
    proxy._sheet.collect(...[...set]);
    return res;
}, name);
export const mapArrayRec = (proxy, arr, mapFn = (x) => x, name = "flatten", nf) => {
    const coll = collector(proxy);
    return proxy.map([arr], (cells) => coll(proxy.mapNoPrevious(cells, (..._cells) => _cells.map((v, i) => Array.isArray(v)
        ? mapArrayRec(proxy, cells[i], mapFn)
        : mapFn(v)))), name, nf);
};
/**
 * implementation of sort for a cellified array.
 * @description this implementation relies on pointers but reuses the original cells.
 * @param proxy
 * @param arr
 * @param compare comparison function
 */
export const sort = (proxy, arr, compare = (a, b) => (a > b ? 1 : a < b ? -1 : 0)) => {
    const coll = collector(proxy);
    return proxy.map([arr], (cells) => coll(proxy.mapNoPrevious(cells, (..._cells) => _cells
        .map((_, index) => index)
        .sort((indexA, indexB) => compare(_cells[indexA], _cells[indexB]))
        .map((index) => cells[index]), "_sort")), "sort");
};
/**
 * mapArrayCell is a variant of `mapArray` with a function taking
 * element cells as arguments.
 * @param proxy
 * @param arr
 * @param fn
 * @returns mapped array cell
 */
export const mapArrayCell = (proxy, arr, fn, name = "map", nf) => {
    let prevFn;
    return proxy.map([arr, fn], (cells, _fn, prev) => {
        const arr = cells.map((cell, i) => 
        // @todo collect previously mapped cells
        reuseOrCreate(_fn === prevFn, // function unchanged
        () => prev?.find((_c) => _c.dependencies?.[0] === cell.id), // reuse
        () => _fn(cell, i) // create new map
        ));
        prevFn = _fn;
        return arr;
    }, name, nf);
};
/**
 * first element of recursive arrays.
 */
export const first = (proxy, arr, name = "last") => {
    // @todo collectors (on path?)
    const aux = (arr) => proxy.mapNoPrevious([arr], (_arr) => {
        if (!Array.isArray(_arr))
            return arr;
        if (_arr.length === 0)
            return null; // @todo pointer to nullCell?
        return aux(_arr[0]);
    }, name);
    return aux(arr);
};
/**
 * last element of recursive arrays.
 */
export const last = (proxy, arr, name = "last") => {
    // @todo collectors (on path?)
    const aux = (arr) => proxy.mapNoPrevious([arr], (_arr) => {
        if (Array.isArray(_arr))
            return aux(_arr[_arr.length - 1]);
        return arr;
    }, name);
    return aux(arr);
};
/**
 * reduce a cellified array.
 * @param proxy
 * @param arr
 * @param fn
 * @param init
 * @returns reduced cell
 */
export const reduce = (proxy, arr, fn, init, name = "reduce", nf) => {
    const coll = collector(proxy);
    return proxy.map([arr], (cells) => coll(proxy.mapNoPrevious(cells, (..._cells) => _cells.reduce(fn, init), "_reduce")), name, nf);
};
export const find = (proxy, arr, predicate, name = "find", nf) => {
    const coll = collector(proxy);
    return proxy.map([arr], (cells) => coll(proxy.mapNoPrevious(cells, (..._cells) => _cells.find(predicate))), name, nf);
};
// @todo generalize
export const findCell = (proxy, arr, predicate, name = "find", nf) => {
    const coll = collector(proxy);
    // Since predicate is a reactive function, we have to instantiate
    // the computation for each cell.
    // const keep = mapArrayCell(proxy, arr, predicate, "keep", nf);
    let prevFn;
    const keep = proxy.map([predicate, arr], (fn, cells, _prev) => {
        // console.log({ keep: cells.length });
        // @todo if the predicate function has changed, collect previous mapped cells
        const keep = cells.map((cell) => {
            // We can reuse a cell only if the predicate hasn't changed.
            // @todo collect previously mapped cells for deleted cells in arr
            const reuse = prevFn === fn &&
                _prev?.find((_c) => _c.dependencies?.[0] === cell.id);
            return reuse || fn(cell);
        });
        prevFn = fn;
        return keep;
    }, "keep", nf);
    return proxy.map([arr, keep], (cells, _keep) => coll(proxy.mapNoPrevious(_keep, (..._flat) => cells.find((_, i) => _flat[i]))), name, nf);
};
export const findIndex = (proxy, arr, fn, name = "find", nf) => {
    const coll = collector(proxy);
    return proxy.map([arr], (cells) => coll(proxy.mapNoPrevious(cells, (..._cells) => _cells.findIndex(fn))), name, nf);
};
/**
 * filter updates a cellified array in a `ValueCell` using a predicate function as filter.
 * @param arr
 * @param predicate function that returns `true` for kept values.
 * @returns nothing
 * @description filtered out cells are _not_ deleted
 */
export const filter = (proxy, predicate, arr, name = "filter", nf) => {
    const coll = collector(proxy);
    return proxy.map([predicate, arr], (fn, cells) => coll(proxy.mapNoPrevious(cells, (..._cells) => cells.filter((_, i) => fn(_cells[i])), "_filter")), name, nf);
};
export const mapFlat = (proxy, arr, name = "flatten", nf) => {
    const coll = collector(proxy);
    return proxy.map([arr], (cells) => coll(proxy.mapNoPrevious(cells, (..._cells) => _cells)), name, nf);
};
/**
 * filterPredicateCell updates a cellified array in a `ValueCell` using a predicate function as filter.
 * @param arr
 * @param predicate as Cell function that returns `true` for kept values.
 * @returns nothing
 * @description filtered out cells are _not_ deleted
 */
export const filterPredicateCell = (proxy, predicate, arr, name = "filter", nf) => {
    const coll = collector(proxy);
    // Since predicate is a reactive function, we have to instantiate
    // the computation for each cell.
    // const keep = mapArrayCell(proxy, arr, predicate, "keep", nf);
    let prevFn;
    const keep = proxy.map([predicate, arr], (fn, cells, _prev) => {
        // console.log({ keep: cells.length });
        // @todo if the predicate function has changed, collect previous mapped cells
        const keep = cells.map((cell) => {
            // We can reuse a cell only if the predicate hasn't changed.
            // @todo collect previously mapped cells for deleted cells in arr
            const reuse = prevFn === fn &&
                _prev?.find((_c) => _c.dependencies?.[0] === cell.id);
            return reuse || fn(cell);
        });
        prevFn = fn;
        return keep;
    }, "keep", nf);
    return proxy.map([arr, keep], (cells, _keep) => coll(proxy.mapNoPrevious(_keep, (..._flat) => cells.filter((_, i) => _flat[i]), "filter.map")), name, nf);
};
