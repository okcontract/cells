import { writeFileSync } from "fs";
import { expect, test } from "vitest";

import { _cellify, _uncellify } from "./cellify";
import { Debugger } from "./debug";
import { isEqual } from "./isEqual.test";
import { cellifyObject, mapObject, reduceObject } from "./object";
import { delayed } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

test("mapObject", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const obj = _cellify(proxy, { a: 1, b: "foo", c: "bar" });
  expect(sheet.stats).toEqual({ count: 4, size: 4 });
  const m = mapObject(proxy, obj, (_k: string, _v: unknown): number =>
    typeof _v === "string" ? _v.length : (_v as number)
  );

  // initial value
  await expect(_uncellify(m)).resolves.toEqual({ a: 1, b: 3, c: 3 });
  expect(sheet.stats).toEqual({ count: 8, size: 8 });

  // update a field
  (await (await obj.get()).a).set(4);
  await expect(_uncellify(m)).resolves.toEqual({ a: 4, b: 3, c: 3 });
  expect(sheet.stats).toEqual({ count: 8, size: 8 });

  // add a field
  obj.update((rec) => ({ ...rec, h: proxy.new("hello") }));
  await expect(_uncellify(obj)).resolves.toEqual({
    a: 4,
    b: "foo",
    c: "bar",
    h: "hello"
  });
  console.log(await _uncellify(m));
  await expect(_uncellify(m)).resolves.toEqual({ a: 4, b: 3, c: 3, h: 5 });
  expect(sheet.stats).toEqual({ count: 10, size: 10 });

  // delete a field
  obj.update((rec) => {
    const copy = { ...rec };
    // biome-ignore lint/performance/noDelete: we don't want an undefined field
    delete copy.a;
    return copy;
  });
  await expect(_uncellify(m)).resolves.toEqual({ b: 3, c: 3, h: 5 });
  expect(sheet.stats).toEqual({ count: 10, size: 9 }); // gc works
});

test("reduceObject", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const l = _cellify(proxy, { a: 1, b: 2, c: 3 });
  const v = reduceObject(proxy, l, (acc, [_key, v]) => acc + (v as number), 0);
  await expect(v.get()).resolves.toBe(6);
  expect(sheet.stats).toEqual({ count: 6, size: 6 }); // 3+1 array +1 sum +1 pointer

  // update one cell
  await (await l.get()).a.set(4);
  await expect(v.get()).resolves.toBe(9);
  expect(sheet.stats).toEqual({ count: 6, size: 6 }); // unchanged

  // add one cell
  l.update((obj) => ({ ...obj, d: proxy.new(5) }));
  await expect(v.get()).resolves.toBe(14);
  expect(sheet.stats).toEqual({ count: 8, size: 7 }); // +1 cell, update pointer
});

test("cellifyObject", async () => {
  const sheet = new Sheet(isEqual);
  const debug = new Debugger(sheet);
  const proxy = new SheetProxy(sheet);

  const obj = proxy.new({ a: 1, b: 2, c: 3 } as Record<string, number>, "obj");
  const c = cellifyObject(proxy, obj);
  await expect(_uncellify(c)).resolves.toEqual({ a: 1, b: 2, c: 3 });
  const a = sheet.get(2);
  const ma = a.map(async (v: number) => delayed(v * 2, 100), "double");

  expect(sheet.stats).toEqual({ count: 6, size: 6 }); // 1 obj + 3 ç + 1 map
  expect(a.value).toBe(1);
  await expect(ma.get()).resolves.toBe(2);

  obj.set({ a: 4, b: 2, d: 10 });
  await expect(_uncellify(c)).resolves.toEqual({ a: 4, b: 2, d: 10 });
  expect(sheet.stats).toEqual({ count: 7, size: 7 }); // +1 ç

  writeFileSync(
    "cellifyObject.dot",
    debug.dot("cellifyObject { a: 4, b: 2, d: 10 }")
  );

  const d = sheet.get(6); // last created is d

  await expect(a.get()).resolves.toBe(4); // cell has been updated
  await expect(d.get()).resolves.toBe(10);
  await expect(ma.consolidatedValue).resolves.toBe(8);

  let count = 0;
  c.subscribe((_) => count++);
  expect(count).toBe(1); // first subscription fired immediately

  obj.set({ a: 4, b: 2, d: 10 });
  expect(sheet.stats).toEqual({ count: 7, size: 7 }); // no change
  expect(count).toBe(1); // same values
  expect(ma.consolidatedValue).toBe(8);

  obj.set({ a: 5, b: 2, d: 10 });
  expect(sheet.stats).toEqual({ count: 7, size: 7 }); // no change
  expect(count).toBe(2); // subscription
  await expect(ma.consolidatedValue).resolves.toBe(10);
});
