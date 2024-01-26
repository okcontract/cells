import { Graph } from "@okcontract/graph";

import { Cell } from "./cell";
import { Sheet } from "./sheet";

/**
 * Debugger for a Sheet.
 * @description When debugging, your application should export the debugger to
 * window: `window["debug"] = new Debugger(sheet);`.
 */
export class Debugger {
  sheet: Sheet;
  cells: { [key: number]: Cell<unknown, boolean, boolean> };
  g: Graph<number>;

  constructor(sheet: Sheet) {
    this.sheet = sheet;
    // @ts-expect-error private
    this.cells = sheet._cells;
    // @ts-expect-error private
    this.g = sheet.g;
  }

  /**
   * search: print all cells whose name matches substring.
   * @param substring
   */
  s(substring: string) {
    const res = [];
    const low = substring.toLowerCase();
    for (const k of Object.keys(this.cells)) {
      const v = this.cells[k];
      if (v.name.toLowerCase().includes(low)) {
        res.push({ cell: v.id, name: v.name, value: v.value });
      }
    }
    return res;
  }

  /**
   * deps: print all dependencies of a given cell.
   * @param cell number
   */
  d(cell: number) {
    if (!this.cells[cell]) {
      console.log("not found");
      return;
    }
    const pred = this.g.predecessors(cell);
    const succ = this.g.get(cell);
    console.log(`[${pred.join(",")}] ==> {${cell}} ==> [${succ.join(",")}]`);
    for (const id of pred)
      console.log({
        "<==": id,
        name: this.cells[id].name,
        value: this.cells[id].value
      });
    console.log("=====");
    console.log({
      cell: cell,
      name: this.cells[cell].name,
      value: this.cells[cell].value
    });
    console.log("=====");
    for (const id of succ)
      console.log({
        "==>": id,
        name: this.cells[id].name,
        value: this.cells[id].value
      });
  }

  /**
   * e: print all cells containing errors.
   * @returns
   */
  e() {
    const res = [];
    for (const k of Object.keys(this.cells)) {
      const v = this.cells[k];
      if (v.value instanceof Error) {
        res.push({ cell: v.id, name: v.name, error: v.value });
      }
    }
    return res;
  }

  /**
   * u: print all undefined cells.
   */
  u() {
    const ids: number[] = [];
    for (const [id, cell] of Object.entries(this.cells)) {
      if (cell.value === undefined) {
        ids.push(+id);
        console.log({ id, name: this.g.name(+id), cell, undefined: true });
      }
    }
    console.log({
      at: Date.now(),
      sort: this.g.topologicalSort()?.filter((id) => ids.includes(id))
    });
  }

  _cell_types() {
    const ty: {
      string: number[];
      number: number[];
      object: number[];
      undefined: number[];
      boolean: number[];
      bigint: number[];
      symbol: number[];
      function: number[];
      null: number[];
    } = {
      string: [],
      number: [],
      object: [],
      undefined: [],
      boolean: [],
      bigint: [],
      symbol: [],
      function: [],
      null: []
    };
    for (const [id, cell] of Object.entries(this.cells)) {
      const v = cell.value;
      ty[v === null ? "null" : typeof v].push(+id);
    }
    return ty;
  }

  dot(title?: string) {
    return this.g.toDot(
      this._cell_types(),
      {
        ...(title && { title }),
        string: "style=filled,fillcolor=aquamarine",
        number: "style=filled,fillcolor=gold",
        object: "style=filled,fillcolor=hotpink",
        undefined: "style=filled,fillcolor=gray",
        boolean: "style=filled,fillcolor=deepskyblue",
        bigint: "style=filled,fillcolor=goldenrod1",
        symbol: "style=filled,fillcolor=green",
        function: "style=filled,fillcolor=orangered",
        null: "style=filled,fillcolor=red"
      },
      // @ts-expect-error private
      this.sheet._pointers
    );
  }
}
