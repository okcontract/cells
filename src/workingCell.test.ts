import { expect, test } from "vitest";

import { delayed } from "./promise";
import { Sheet } from "./sheet";
import { SheetProxy } from "./proxy";

test("working in a sheet", async () => {
  const sheet = new Sheet();
  const cell = sheet.new(delayed(1, 200));
  // working available and at true
  expect(sheet.working.get()).toBe(true);
  // computation is not finished, value is undefined
  expect(cell.value).toBe(undefined);
  // computation is registered, we can wait for it to end
  await sheet.working.wait();
  expect(cell.value).toBe(1);
  expect(sheet.working.get()).toBe(false);
});

test("working in a proxy affected only by proxy's cell", async () => {
  const sheet = new Sheet();
  const cell = sheet.new(delayed(1, 200));
  const proxy = new SheetProxy(sheet);
  expect(proxy.working.get()).toBe(false);
  const cellInProxy = proxy.map([cell], (b) => delayed(1 + 1, 1000));
  expect(proxy.working.get()).toBe(true);
  expect(cellInProxy.value).toBeUndefined;
  await expect(cellInProxy.get()).resolves.toBe(2);
  expect(proxy.working.get()).toBe(false);
});
