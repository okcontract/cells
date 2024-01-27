import { expect, test } from "vitest";

import { Debugger } from "./debug";
import { Sheet } from "./sheet";

test("Debugger", () => {
  const sheet = new Sheet();
  const debug = new Debugger(sheet);
  const a = sheet.new(1, undefined, "age");
  const b = sheet.new("foo", undefined, "name");
  const c = sheet.map([a, b], (_a, _b) => _a + _b.length);
  const d = c.map((_) => {
    throw new Error("no");
  });
  expect(debug.p(1)).toBe("[] ==> {1} ==> [2]");
  const errs = debug.e;
  expect(errs.length).toBe(1);
  expect(errs[0].cell).toBe(3);
  expect(debug.dot()).toBe(
    'digraph {\nsubgraph { node [style=filled,fillcolor=aquamarine]; "name (1)"; }\nsubgraph { node [style=filled,fillcolor=gold]; "age (0)";\n"undefined (2)"; }\nsubgraph { node [style=filled,fillcolor=hotpink]; "undefined (3)"; }\n  "age (0)" -> "undefined (2)";\n  "name (1)" -> "undefined (2)";\n  "undefined (2)" -> "undefined (3)";\n  "undefined (3)";\n}\n'
  );
  expect(debug.s("ag")).toEqual([
    {
      cell: 0,
      name: "age",
      value: 1
    }
  ]);
});
