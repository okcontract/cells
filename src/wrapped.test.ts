import { expect, test } from "vitest";

import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";
import { WrappedCell } from "./wrapped";

test("wrapped mapped", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const cell = proxy.new(1);

  const local = new SheetProxy(sheet);
  const wrapped = new WrappedCell(cell, local);

  const mapped = wrapped.map((v) => v + 1);
  expect(mapped.get()).resolves.toBe(2);

  cell.set(2);
  expect(mapped.get()).resolves.toBe(3);
});
