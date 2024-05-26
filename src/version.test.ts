import { expect, test } from "vitest";

import { isEqual } from "./isEqual.test";
import { delayed, sleep } from "./promise";
import { Sheet } from "./sheet";

test("version for ValueCell", async () => {
  const proxy = new Sheet(isEqual).newProxy();
  const a = proxy.new(1);
  expect(a.version).toBe(1);
  a.set(2);
  expect(a.version).toBe(2);
  a.update((v) => v + 1);
  expect(a.version).toBe(3);
  a.update((v) => delayed(v + 1, 10));
  expect(a.version).toBe(3);
  await sleep(20);
  expect(a.version).toBe(4);
});

test("version for ValueCell promise", async () => {
  const proxy = new Sheet(isEqual).newProxy();
  const a = proxy.new(delayed(1, 10));
  expect(a.version).toBe(0);
  await sleep(20);
  expect(a.version).toBe(1);
});

test("version for MapCell", async () => {
  const proxy = new Sheet(isEqual).newProxy();
  const a = proxy.new(1);
  const b = a.map((v) => v + 1);
  expect(b.version).toBe(1);
  a.set(2);
  expect(b.version).toBe(2);
  const c = a.map((v) => delayed(v * 2, 10));
  expect(c.version).toBe(0);
  await sleep(20);
  expect(c.version).toBe(1);
  a.set(3);
  expect(c.version).toBe(1);
  await sleep(20);
  expect(c.version).toBe(2);
});
