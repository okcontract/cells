/**
 * collector returns a function that automatically collects a cell
 * each time it is re-created.
 */
export const collector = (proxy) => {
    let prev;
    return (v) => {
        // mark the previous value for deletion
        if (prev)
            proxy._sheet.collect(prev);
        prev = v;
        return v;
    };
};
/**
 * reuse previously mapped cell only if same fn.
 */
export const reuseOrCreate = (cond, reuse, create) => (cond ? reuse() || create() : create());
