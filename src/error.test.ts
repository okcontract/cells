import { expect, test } from "vitest";

import type { ErrorsList } from "./cell";
import { CellError } from "./errors";
import { delayed, sleep } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

const oddError = new Error("odd");

test("cell with error", () => {
  const sheet = new Sheet();
  const cell = sheet.new(2);
  const evenOrDie = cell.map((v) => {
    if (v % 2 === 0) return true;
    throw oddError;
  });
  expect(evenOrDie.value).toBe(true);
  expect(evenOrDie.error).toBeUndefined();

  cell.set(3); // no error
  expect(evenOrDie.value).toBeInstanceOf(Error); // not modified
  expect(evenOrDie.error).toBeDefined();
  // @todo test that we don't dispatch

  cell.set(4);
  expect(evenOrDie.value).toBe(true);
  expect(evenOrDie.error).toBeUndefined();
});

test("cell with error async", async () => {
  const sheet = new Sheet();
  const cell = sheet.new(2);
  const evenOrDie = cell.map(async (v) => {
    if (v % 2 === 0) return delayed(true, 100);
    throw oddError;
  });

  expect(await evenOrDie.consolidatedValue).toBe(true);
  expect(evenOrDie.error).toBeUndefined();

  cell.set(3); // does not throw an error
  expect(await evenOrDie.consolidatedValue).toBeInstanceOf(Error); // not modified
  expect(evenOrDie.error).toBeDefined();

  cell.set(4);
  expect(await evenOrDie.consolidatedValue).toBe(true);
  expect(evenOrDie.error).toBeUndefined();
});

test("proxy errors", async () => {
  const sheet = new Sheet();
  const store = new SheetProxy(sheet);
  const cell = store.new(2);
  // We can now use cell.map because it cell was created with
  // the proxy so it inherits from it.
  const evenOrDie = cell.map(async (v) => {
    if (v % 2 === 0) return delayed(true, 100);
    throw oddError;
  });
  const not = evenOrDie.map((v) => !v);
  // account for proxy's working cell
  expect(store.size).toBe(4);
  expect(await not.get()).toBe(false);
  expect(store.errors.get()).toEqual(new Map());

  cell.set(3);
  await sheet.working.wait();
  // @todo new semantics is
  // that error propagates,
  // that get wait when a computation is ongoing.
  // [not] can only be false at the same time evenOrDie is true.
  // expect(await not.get()).toBe(false);
  expect(evenOrDie.consolidatedError).toBeDefined();
  expect(not.consolidatedError).toBeDefined();
  const expectedError: ErrorsList = new Map();
  expectedError.set(evenOrDie.id, oddError);
  expect(store.errors.get()).toEqual(expectedError);
  expect(not.value).toEqual(new CellError(evenOrDie.id, "Error: odd"));

  cell.set(4);
  //@todo this one should not be necessary
  expect(await not.consolidatedValue).toBe(false);
  expect(evenOrDie.consolidatedError).toBeUndefined();

  // test destroy
  // cells count includes proxy and store working and errors special cells
  expect(sheet.stats).toEqual({ count: 3, size: 3 });
  // store.destroy();
  // expect(store.size).toBe(1);
  // expect(sheet.stats).toEqual({ count: 7, size: 4 });
});

test("sheet's (initial) errors are in the error cell", () => {
  const sheet = new Sheet();
  const cell = sheet.new(2);
  const error = new Error("ouch");
  const errorCell = cell.map((v) => {
    throw error;
  });
  const expectedError: ErrorsList = new Map();
  expectedError.set(errorCell.id, error);
  expect(sheet.errors.get()).toEqual(expectedError);
  const errorInDep = errorCell.map((v) => v + 1);
  expect(errorInDep.value).toEqual(new CellError(errorCell.id, "Error: ouch"));
  expect(sheet.errors.get()).toEqual(expectedError);
});

test("Proxy's (initial) errors are in the error cell", () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const cell = proxy.new(2);
  const error = new Error("ouch");
  const errorCell = cell.map((_v) => {
    throw error;
  });
  const errorCellNotInProxy = sheet.map([cell], (_v) => {
    throw error;
  });
  const expectedError: ErrorsList = new Map();
  expectedError.set(errorCell.id, error);
  expect(proxy.errors.get()).toEqual(expectedError);
  expectedError.set(errorCellNotInProxy.id, error);
  expect(proxy.errors.get()).not.toEqual(expectedError);
  expect(sheet.errors.get()).toEqual(expectedError);
});

test(
  "Error cascade without pointers",
  async () => {
    const sheet = new Sheet();
    const proxy = new SheetProxy(sheet);

    const fails = async (): Promise<string> => {
      throw new Error("a");
    };

    const a = proxy.new(delayed(1, 15), "a");
    const b = proxy.new(delayed("foo", 10), "b");

    const c = proxy.map([a, b], (_a, _b) => fails(), "c");
    const d = proxy.map([a, c], (a, _c) => a, "d");

    //       * (throws)
    //      ↑
    // a ─┬─ c ── d
    // b ─┴
    await expect(d.get()).resolves.toBeInstanceOf(Error);
  },
  { timeout: 1000 }
);

test("Error cascade with pointers", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const fails = async (): Promise<string> => {
    throw new Error("a");
  };

  const a = proxy.new(delayed(1, 15));
  const b = proxy.new(delayed("foo", 10));

  const aa = proxy.new(a);
  const bb = proxy.new(b);

  const c = proxy.map([aa, bb], (_a, _b) => fails());
  const cc = proxy.new(c);
  const d = proxy.map([aa, cc], (a, _c) => a);

  await expect(d.get()).resolves.toBeInstanceOf(Error);
});

test("Errors in set", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const fails = async (): Promise<string> => {
    throw new Error("a");
  };
  const a = proxy.new(fails());
  await expect(a.get()).resolves.toBeInstanceOf(Error);
});
