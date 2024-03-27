import { expect, test } from "vitest";
import { clock, clockWork } from "./clock";
import { sleep } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

test("clock", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const live = proxy.new(true);
  const cl = clock(proxy, live, 10);
  const l = [];
  cl.subscribe((v) => l.push(v));
  expect(l).toEqual([0]);
  await sleep(15);
  expect(l).toEqual([0, 1]);
  await sleep(10);
  expect(l).toEqual([0, 1, 2]);
  // stop
  live.set(false);
  await sleep(10);
  expect(l).toEqual([0, 1, 2]);
  // restart
  live.set(true);
  await sleep(10);
  expect(l).toEqual([0, 1, 2, 3]);
});

test("clockWork", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const live = proxy.new(true);
  const cl = clock(proxy, live, 10);
  const a = proxy.new(100, "a");
  const work = clockWork(proxy, cl, [a], (v: number) => v + 1);
  await expect(work.get()).resolves.toBe(101);
  a.set(1000);
  await expect(work.get()).resolves.toBe(101);
  await sleep(15);
  await expect(work.get()).resolves.toBe(1001);
});

type M = Record<string, number>;
test("wait list", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const live = proxy.new(true);
  const cl = clock(proxy, live, 10);
  const q = proxy.new([] as string[], "q");
  const m = clockWork(
    proxy,
    cl,
    [q],
    (_q: string[], prev) =>
      ({
        ...((prev as M) || ({} as M)),
        ...Object.fromEntries(_q.map((elt) => [elt, elt.length]))
      }) as M,
    "m"
  );
  await expect(m.get()).resolves.toEqual({});
  q.set(["foo", "bar"]);
  await expect(m.get()).resolves.toEqual({});
  await sleep(15);
  await expect(m.get()).resolves.toEqual({ foo: 3, bar: 3 });
  q.set(["test"]);
  await expect(m.get()).resolves.toEqual({ foo: 3, bar: 3 });
  await sleep(10);
  await expect(m.get()).resolves.toEqual({ foo: 3, bar: 3, test: 4 });
});
