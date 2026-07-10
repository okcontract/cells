import { afterEach, expect, spyOn, test } from "bun:test";

import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

const getItemSpy = spyOn(Storage.prototype, "getItem");
const setItemSpy = spyOn(Storage.prototype, "setItem");

afterEach(() => {
  localStorage.clear();
  getItemSpy.mockClear();
  setItemSpy.mockClear();
});

test("basic persistence", async () => {
  const sheet = new Sheet();
  const _storageKey = "test/foo";
  let proxy = new SheetProxy(sheet);
  let cell = proxy.new(13, "v", { _storageKey });
  await expect(cell.get()).resolves.toEqual(13);
  cell.set(11);
  await expect(cell.get()).resolves.toEqual(11);
  proxy.destroy();

  proxy = new SheetProxy(sheet);
  cell = proxy.new(0, "v", { _storageKey });
  await expect(cell.get()).resolves.toEqual(11);
  proxy.destroy();
});
