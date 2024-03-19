import { CellErrors, Working } from "./cell";
import { dispatch } from "./promise";
/**
 * SheetProxy is a proxy that automatically registers locally
 * created cells to delete them in a single call.
 */
export class SheetProxy {
    constructor(sh, name) {
        if (!sh) {
            throw new Error("no sheet");
        }
        this._sheet = sh;
        // if (name) this._name = name;
        this._list = [];
        this.working = new Working(sh.working);
        this.errors = new CellErrors(sh.errors);
    }
    bless(id, name) {
        this._sheet.bless(id, name);
    }
    name(id) {
        return this._sheet.name(id);
    }
    new(value, name, // @todo migrate to options
    options) {
        const cell = this._sheet.new(value, this, name, options);
        // using the fact that if value is a pending promise,
        // consolidated value will resolve when value is resolved.
        this.working.addComputation(cell.id, cell.consolidatedValue);
        this._list.push(cell);
        return cell;
    }
    /**
     * map a list to cells to a new cells using the compute function.
     * @param dependencies list of existing cells
     * @param computeFn function to apply to cells values and an extra argument
     * that is the previous value of the resulting cell (if any).
     * @param name optional name
     * @param noFail if true, then we know `computeFn` can't throw
     * @returns
     */
    map(dependencies, computeFn, name, noFail) {
        // @ts-expect-error conflict with overloaded definitions
        const cell = this._sheet.map(dependencies, computeFn, name, this, noFail);
        this._list.push(cell);
        return cell;
    }
    /**
     * mapNoPrevious maps a list to cells to a new cells using the compute function.
     * @param dependencies list of existing cells
     * @param computeFn function to apply to cells values, without extra arguments
     * @param name optional name
     * @param noFail if true, then we know `computeFn` can't throw
     * @returns
     */
    mapNoPrevious(dependencies, computeFn, name, noFail) {
        const cell = this._sheet.mapNoPrevious(dependencies, computeFn, name, this, noFail);
        this._list.push(cell);
        return cell;
    }
    get(id) {
        return this._sheet.get(id);
    }
    _update(id) {
        const release = this.working.startNewComputation();
        const computation = this._sheet._update(id);
        dispatch(computation, release);
        return computation;
    }
    equals(a, b) {
        return this._sheet.equals(a, b);
    }
    get size() {
        // the special working cell is not in the list,
        // but we count it to be in sync with sheet.stats
        return this._list.length + 1;
    }
    wait() {
        return this.working.wait();
    }
    /**
     * destroy the Proxy and free memory.
     * @todo check for memory leaks
     */
    destroy() {
        // if (!this?._sheet) {
        //   throw new Error(`missing: ${this?._name}`);
        // }
        this._sheet.delete(...this._list);
        this._list = [];
    }
}
