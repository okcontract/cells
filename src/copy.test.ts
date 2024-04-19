import { expect, test } from "vitest";

import { copy } from "./copy";
import { delayed } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

test("copy cell", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const a = proxy.new("foo");
  const b = a.map((s) => s.length);
  const c = copy(proxy, b);

  await expect(c.get()).resolves.toBe(3);
});

test("copy cell async", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const a = proxy.new("foo");
  const b = a.map((s) => delayed(s.length, 10));
  const c = copy(proxy, b);

  await expect(c.get()).resolves.toBe(3);
});

test("copy cell error", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const err = new Error("error");

  const a = proxy.new("foo");
  const b = a.map((_s) => {
    throw err;
  });
  const c = copy(proxy, b);
  await expect(c.get()).resolves.toBe(err);
});
