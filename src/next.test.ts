import { expect, test } from "vitest";

import { nextSubscriber } from "./next";
import { sleep } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

test("nextSubscriber", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const cell = proxy.new(1, "init");

  let f = 0;
  nextSubscriber(cell, (v) => {
    f = v;
  });

  // we wait
  await sleep(10);
  expect(f).toBe(0);

  cell.set(2);
  expect(f).toBe(2);

  cell.set(3);
  expect(f).toBe(2);
});
