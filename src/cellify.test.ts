import { expect, test } from "vitest";

import {
  type Cellified,
  type Uncellified,
  _cellify,
  _uncellify
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
