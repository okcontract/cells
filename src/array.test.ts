import { expect, test } from "vitest";

import { mapArray, reduce, sort } from "./array";
import { _uncellify } from "./cellify";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

test("mapArray", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const l = proxy.new([1, 2, 3].map((v) => proxy.new(v)));
  expect(sheet.stats.count).toBe(4);
  const m = mapArray(proxy, l, (v: number) => v + 1);
  expect(sheet.stats.count).toBe(8); // +4 cells

  // initial value
  await expect(_uncellify(m)).resolves.toEqual([2, 3, 4]);
  expect(sheet.stats.count).toBe(8); // unchanged

  // update one cell
  (await l.get())[0].set(4);
  await expect(_uncellify(m)).resolves.toEqual([5, 3, 4]);
  expect(sheet.stats.count).toBe(8); // @unchanged

  // add one cell
  l.update((arr) => [...arr, proxy.new(5)]);
  await expect(_uncellify(m)).resolves.toEqual([5, 3, 4, 6]);
  expect(sheet.stats.count).toBe(10); // +1 original cell, +1 new mapped

  // get one cell
  expect(await (await m.get())[3].get()).toBe(6);

  // delete one cell
  l.update((arr) => [...arr.slice(0, 1), ...arr.slice(1 + 1)]);
  await expect(_uncellify(m)).resolves.toEqual([5, 4, 6]);
  expect(await (await m.get())[2].get()).toBe(6);
  expect(sheet.stats.count).toBe(10); // @unchanged
});

test("reduce array", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const l = proxy.new([1, 2, 3].map((v) => proxy.new(v)));
  const v = reduce(proxy, l, (acc, v) => acc + v, 0);
  await expect(v.get()).resolves.toBe(6);
  expect(sheet.stats.count).toBe(6); // 3+1 array +1 sum +1 pointer

  // update one cell
  (await l.get())[0].set(4);
  await expect(v.get()).resolves.toBe(9);
  expect(sheet.stats.count).toBe(6); // @unchanged

  // add one cell
  l.update((arr) => [...arr, proxy.new(5)]);
  await expect(v.get()).resolves.toBe(14);
  expect(sheet.stats.count).toBe(8); // +1 cell +1 pointer
});

test("sort array", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const l = proxy.new([1, 5, 3].map((v) => proxy.new(v)));
  const s = sort(proxy, l);

  await expect(_uncellify(s)).resolves.toEqual([1, 3, 5]);
  expect(sheet.stats.count).toBe(6); // 3+1 array +1 sorted +1 pointer

  // update one cell
  (await l.get())[0].set(4);
  await expect(_uncellify(s)).resolves.toEqual([3, 4, 5]);
  expect(sheet.stats.count).toBe(6); // @unchanged

  // add one cell
  l.update((arr) => [...arr, proxy.new(1)]);
  await expect(_uncellify(l)).resolves.toEqual([4, 5, 3, 1]);
  await expect(_uncellify(s)).resolves.toEqual([1, 3, 4, 5]);
  expect(sheet.stats.count).toBe(8); // +1 original cell +1 sorted pointer
});
