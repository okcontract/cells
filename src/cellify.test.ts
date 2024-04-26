import { expect, test } from "vitest";

import {
  type Cellified,
  type Uncellified,
  _cellify,
  _uncellify,
  follow
} from "./cellify";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

type IsEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

test("", () => {
  type T = { a: string[] }[];
  type C = Cellified<T>;
  type U = Uncellified<C>;

  type ok = IsEqual<T, U>;
  // no type error
  // @todo run definitions for tests too
  const _: ok = true as const;
});

test("fix point", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const tests = [
    {},
    "hello, world",
    { a: 1 },
    { b: [1, 2] },
    { date: new Date() },
    null
  ] as const;

  for (let i = 0; i < tests.length; i++) {
    const v = tests[i];
    const c = _cellify(proxy, v);
    const u = await _uncellify(c);
    expect(u).toEqual(v);
  }
});

test("_cellify one", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const res = _cellify(proxy, { a: 1 });
  const cell = await res.get();
  await expect(cell.a.get()).resolves.toBe(1);
});

test("follow", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const v = { a: [1, 2, 3], b: { c: { foo: 1, bar: 1 } } };
  const cv = _cellify(proxy, v);
  const f = follow(proxy, cv, ["a", 1]);
  await expect(f.get()).resolves.toBe(2);
  expect(sheet.stats).toEqual({ size: 12, count: 12 });

  // update the cell directly
  (await (await cv.get()).a.get())[1].set(4);
  await expect(f.get()).resolves.toBe(4);
  expect(sheet.stats).toEqual({ size: 12, count: 12 }); // unchanged

  // prepend a new cell in array
  (await cv.get()).a.update((l) => [proxy.new(0), ...l]);
  await expect(f.get()).resolves.toBe(1);
  expect(sheet.stats).toEqual({ size: 13, count: 14 }); // one new cell, update one pointer

  // delete path, cell is error
  (await cv.get()).a.set([]);
  await expect(f.get()).resolves.toBeInstanceOf(Error);
  expect(sheet.stats).toEqual({ size: 13, count: 14 }); // unchanged
});

test("cellify failOnCell", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const v = { a: [1, 2, 3], b: { c: { foo: proxy.new(1, "1"), bar: 1 } } };
  expect(() => _cellify(proxy, v, "cv", true)).toThrowError("value is cell");
});
