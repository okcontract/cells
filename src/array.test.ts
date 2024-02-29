import { expect, test } from "vitest";

import type { Graph } from "@okcontract/graph";

import {
  filter,
  filterPredicateCell,
  find,
  findIndex,
  first,
  last,
  mapArray,
  mapArrayCell,
  reduce,
  sort
} from "./array";
import type { AnyCell } from "./cell";
import { _uncellify } from "./cellify";
import { delayed } from "./promise";
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

test("mapArrayCell function change", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const l = proxy.new([1, 2, 3].map((v) => proxy.new(v)));
  expect(sheet.stats.count).toBe(4);
  const fn = proxy.new((v: AnyCell<number>) => v.map((v) => v + 1));
  const m = mapArrayCell(proxy, l, fn);
  expect(sheet.stats.count).toBe(9); // +4 cells
  await expect(_uncellify(m)).resolves.toEqual([2, 3, 4]);

  // update one cell
  (await l.get())[0].set(4);
  await expect(_uncellify(m)).resolves.toEqual([5, 3, 4]);
  expect(sheet.stats.count).toBe(9); // @unchanged

  // function change
  fn.set((v: AnyCell<number>) => v.map((v) => v - 1));
  await expect(_uncellify(m)).resolves.toEqual([3, 1, 2]);
  expect(sheet.stats.count).toBe(12); // +3 new mapped cells
});

test("mapArray async", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const l = proxy.new([1, 2, 3].map((v) => proxy.new(v)));
  expect(sheet.stats.count).toBe(4);
  const m = mapArray(proxy, l, (v: number) => delayed(v + 1, 10));
  expect(sheet.stats.count).toBe(8); // +4 cells

  // initial value
  await expect(_uncellify(m)).resolves.toEqual([2, 3, 4]);
  expect(sheet.stats.count).toBe(8); // unchanged

  // update one cell
  (await l.get())[0].set(4);
  await proxy.working.wait();
  await expect(_uncellify(m)).resolves.toEqual([5, 3, 4]);
  expect(sheet.stats.count).toBe(8); // @unchanged

  // add one cell
  l.update((arr) => [...arr, proxy.new(5)]);
  await proxy.working.wait();
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

test("function equality", () => {
  const f = (v: number) => v + 1;
  const g = (v: number) => v + 1;
  // expect(f == g).toBe(false);
  expect(f === g).toBe(false);
  // expect(f == f).toBe(true);
  // expect(f === f).toBe(true);
  const m = new Map();
  m.set(f, "a");
  expect(m.get(f)).toBe("a");
  expect(m.get(g)).toBeUndefined();

  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const a = proxy.new(1);
  const b = a.map(f);

  // @ts-expect-error private
  const gr = sheet.g as Graph<number>;
  expect(gr.get(a.id)).toEqual([b.id]);
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

test("filter array", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const l = proxy.new([1, 5, 3].map((v) => proxy.new(v)));
  expect(sheet.stats.count).toBe(4); // 3+1 array

  const pred = proxy.new((v: number) => v > 2);
  const f = filter(proxy, pred, l, "threshold", true); // no await
  expect(sheet.stats.count).toBe(7); // + pred + filter + pointer

  // we wait before expecting
  await proxy.working.wait();
  await expect(_uncellify(f)).resolves.toEqual([5, 3]);
  // the removed cell is not deleted ("garbage collected" at proxy level)
  expect(sheet.stats.count).toBe(7); // unchanged

  // update one cell
  (await l.get())[0].set(4);
  await expect(_uncellify(f)).resolves.toEqual([4, 5, 3]);
  expect(sheet.stats.count).toBe(7); // unchanged

  // change predicate
  pred.set((v) => v > 3);
  await expect(_uncellify(f)).resolves.toEqual([4, 5]);
  expect(sheet.stats).toEqual({ size: 7, count: 8 }); // one pointer updated
});

test("filterPredicateCell array", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const l = proxy.new([1, 5, 3].map((v) => proxy.new(v)));
  expect(sheet.stats).toEqual({ size: 4, count: 4 }); // 3+1 array

  const pred = proxy.new((v: AnyCell<number>) => v.map((_v) => _v > 2));
  const f = filterPredicateCell(proxy, pred, l, "threshold", true); // no await
  expect(sheet.stats).toEqual({ size: 11, count: 11 }); // +3+1 pred output array +1 pointer +1 filtered

  // we wait before expecting
  await proxy.working.wait();
  await expect(_uncellify(f)).resolves.toEqual([5, 3]);

  pred.set((v: AnyCell<number>) => v.map((_v) => _v > 3));
  await proxy.working.wait();
  await expect(_uncellify(f)).resolves.toEqual([5]);
  expect(sheet.stats).toEqual({ size: 14, count: 15 }); // we should not recreate mapped cells
});

test("sorted array pointer", async () => {
  const proxy = new Sheet().newProxy();
  const l = proxy.new([1, 5, 3].map((v) => proxy.new(v)));
  const s = sort(proxy, l);
  const count = s.map((l) => l.length);
  l.update((arr) => [...arr, proxy.new(5)]);
  // not required
  // await proxy.working.wait();
  await expect(count.get()).resolves.toBe(4);
});

test("findIndex", async () => {
  const proxy = new Sheet().newProxy();
  const l = proxy.new([1, 5, 3].map((v) => proxy.new(v)));
  const idx = findIndex(proxy, l, (v) => v === 5);
  await expect(idx.get()).resolves.toBe(1);
  l.update((l) => [proxy.new(1), ...l]);
  await expect(idx.get()).resolves.toBe(2);
});

test("sort array remapped", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const l = proxy.new([1, 5, 3].map((v) => proxy.new(v)));
  const s = sort(proxy, l);
  const sp = proxy.new(s);
  const sum = reduce(
    proxy,
    sp,
    async (acc, v) => (await acc) + v,
    Promise.resolve(0)
  );

  await expect(_uncellify(s)).resolves.toEqual([1, 3, 5]);
  expect(sheet.stats).toEqual({ size: 9, count: 9 }); // 3+1 array +1 sorted +1 pointer +1 sum +1 pointer
  await expect(sum.get()).resolves.toBe(9);

  // update one cell
  (await l.get())[0].set(4);
  await expect(_uncellify(s)).resolves.toEqual([3, 4, 5]);
  await expect(sum.get()).resolves.toBe(12);
  expect(sheet.stats).toEqual({ size: 9, count: 10 }); // size unchanged, one pointer changed

  // add one cell
  l.update((arr) => [...arr, proxy.new(1)]);
  await expect(_uncellify(l)).resolves.toEqual([4, 5, 3, 1]);
  await expect(_uncellify(s)).resolves.toEqual([1, 3, 4, 5]);
  await expect(sum.get()).resolves.toBe(13);
  expect(sheet.stats).toEqual({ size: 10, count: 13 }); // +1 original cell, changed 2 pointers
});

test("first and last", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const arr = proxy.new([1, 5, 3].map((v) => proxy.new(v)));
  const fst = first(proxy, arr);
  const lst = last(proxy, arr);
  await expect(fst.get()).resolves.toEqual(1);
  await expect(lst.get()).resolves.toEqual(3);
});

test("basic find", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const arr = proxy.new([1, 5, 3].map((v) => proxy.new(v)));
  const f = find(proxy, arr, (v) => v > 2);
  await expect(f.get()).resolves.toEqual(5);
});
