import { writeFileSync } from "node:fs";
import { expect, test } from "vitest";

import { cellify, uncellify } from "./cellify";
import { Debugger } from "./debug";
import { isEqual } from "./isEqual.test";
import { asyncReduce, flattenObject, mapObject, reduceObject } from "./object";
import { delayed } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

test("mapObject", async () => {
  const sheet = new Sheet(isEqual);
  const proxy = new SheetProxy(sheet);

  const obj = cellify(proxy, { a: 1, b: "foo", c: "bar" });
  expect(sheet.stats).toEqual({ count: 4, size: 4 });
  const m = mapObject(proxy, obj, (_k: string, _v: unknown): number =>
    typeof _v === "string" ? _v.length : (_v as number)
  );

  // initial value
  await expect(uncellify(m)).resolves.toEqual({ a: 1, b: 3, c: 3 });
  expect(sheet.stats).toEqual({ count: 8, size: 8 });

  // update a field
  (await (await obj.get()).a).set(4);
  await expect(uncellify(m)).resolves.toEqual({ a: 4, b: 3, c: 3 });
  expect(sheet.stats).toEqual({ count: 8, size: 8 });

  // add a field
  obj.update((rec) => ({ ...rec, h: proxy.new("hello") }));
  await expect(uncellify(obj)).resolves.toEqual({
    a: 4,
    b: "foo",
    c: "bar",
    h: "hello"
  });
  console.log(await uncellify(m));
  await expect(uncellify(m)).resolves.toEqual({ a: 4, b: 3, c: 3, h: 5 });
  expect(sheet.stats).toEqual({ count: 10, size: 10 });

  // delete a field
  obj.update((rec) => {
    const copy = { ...rec };
    // biome-ignore lint/performance/noDelete: we don't want an undefined field
    delete copy.a;
    return copy;
  });
  await expect(uncellify(m)).resolves.toEqual({ b: 3, c: 3, h: 5 });
  expect(sheet.stats).toEqual({ count: 10, size: 9 }); // gc works
});

test("asyncReduce", async () => {
  await expect(
    asyncReduce([1, 2, 3], (acc, v) => delayed(acc + v, 10), 0)
  ).resolves.toBe(6);
});

test(
  "reduceObject",
  async () => {
    const sheet = new Sheet(isEqual);
    const debug = new Debugger(sheet);
    const proxy = new SheetProxy(sheet);

    const l = cellify(proxy, { a: 1, b: 2, c: 3 });
    const v = reduceObject(
      proxy,
      l,
      async (acc, _key, v) => delayed(acc + (v as number), 1),
      0
    );
    writeFileSync("reduceObject1.dot", debug.dot("reduceObject before"));
    await expect(v.consolidatedValue).resolves.toBe(6);
    expect(sheet.stats).toEqual({ count: 6, size: 6 }); // 3+1 array +1 sum +1 pointer

    // update one cell
    await (await l.get()).a.set(4);
    await expect(v.consolidatedValue).resolves.toBe(9);
    writeFileSync("reduceObject2.dot", debug.dot("reduceObject after update"));
    expect(sheet.stats).toEqual({ count: 6, size: 6 }); // unchanged

    // add one cell
    l.update((obj) => ({ ...obj, d: proxy.new(5, "n:5") }));
    await expect(v.consolidatedValue).resolves.toBe(14);
    writeFileSync("reduceObject3.dot", debug.dot("reduceObject after add"));
    expect(sheet.stats).toEqual({ count: 8, size: 7 }); // +1 cell, update pointer
  },
  { timeout: 1000 }
);

test("flattenObject", async () => {
  const sheet = new Sheet(isEqual);
  const debug = new Debugger(sheet);
  const proxy = new SheetProxy(sheet);

  const obj = cellify(proxy, { a: 1, b: 2, c: 3 });
  const f = flattenObject(proxy, obj);
  await expect(f.consolidatedValue).resolves.toEqual({ a: 1, b: 2, c: 3 });
  expect(sheet.stats).toEqual({ count: 6, size: 6 }); // 3+1 obj +1 flatten +1 pointer

  await (await obj.consolidatedValue).a.set(4);
  await expect(f.get()).resolves.toEqual({ a: 4, b: 2, c: 3 });
  expect(sheet.stats).toEqual({ count: 6, size: 6 }); // unchanged
});
