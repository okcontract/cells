/**
 * WrappedCell is a Cell, where subsequent calls to `.map()` use a different
 * proxy than the cell proxy.
 *
 * This is useful when we want to keep a cache of cells, and locally creating
 * mapped values from the cache.
 */
export class WrappedCell {
    constructor(cell, proxy) {
        this.get = () => this._cell.get();
        this.set = (value) => this._cell.set(value);
        this.map = (fn, name, noFail) => this._proxy.map([this._cell], fn, name, noFail);
        this.subscribe = (runRaw, invalidate) => this._cell.subscribe(runRaw, invalidate);
        this._cell = cell;
        this._proxy = proxy;
    }
    get value() {
        return this._cell.value;
    }
    get cell() {
        return this._cell;
    }
    get working() {
        return this._cell.working;
    }
}
