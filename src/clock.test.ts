import { expect, test } from "vitest";
import { clock } from "./clock";
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
