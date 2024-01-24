import { expect, test } from "vitest";

import { MapCell, ValueCell } from "./cell";
import { delayed, sleep } from "./promise";
import { Sheet } from "./sheet";

test("basic sheet", () => {
  const sheet = new Sheet();
  const a1 = sheet.new(3);
  const b1 = sheet.new(5);
  const a2 = sheet.map([a1, b1], (a1, b1) => a1 + b1);
  const b2 = sheet.map([a2, b1], (a2, b1) => a2 + b1);
  // const computedValues = sheet.computeAll();
  expect(a1.value).toEqual(3);
  expect(b1.value).toEqual(5);
  expect(a2.value).toEqual(8);
  expect(b2.value).toEqual(13);
});

test("map previous value", () => {
  const sheet = new Sheet();
  const one = sheet.new(3);
  const two = sheet.new(5);
  const m = sheet.map(
    [one, two],
    (one, two, prev?: number) => one * two + (prev || 0)
  );
  expect(m.value).toEqual(15);
  one.set(2);
  expect(m.value).toEqual(25);
});

test("type errors", () => {
  const sheet = new Sheet();
  const a1 = sheet.new(3);
  const f = (a: string) => a + a;
  // @ts-expect-error
  const a2 = sheet.map([a1], f);
  // value is computed because JavaScript runtime is not typed
  expect(a2.value).toBe(6);
});

test("can't update compute cell", () => {
  const sheet = new Sheet();
  const a1 = sheet.new(3);
  const b1 = sheet.new(5);
  const a2 = sheet.map([a1, b1], (a1, b1) => a1 + b1);
  expect((a2 as any).set).toBeUndefined();
});

test("direct updates", () => {
  const sheet = new Sheet();
  const a1 = sheet.new(3);
  a1.bless("a1");
  const b1 = sheet.new(5);
  b1.bless("b1");
  const a2 = sheet.map([a1, b1], (a1, b1) => a1 + b1);
  a2.bless("a2");
  expect(a2.value).toBe(8);
  b1.set(4);
  expect(a2.value).toBe(7);
});

test("sheet with circular dependencies throws error", () => {
  const sheet = new Sheet();
  let a1: MapCell<number, false>;
  let a2: ValueCell<number>;
  expect(() => {
    a1 = sheet.map([a2], (a2) => a2);
    // @todo maybe catch with a better error?
  }).toThrow("Cannot read properties of undefined");
});

test("Cell subscription", async () => {
  const sheet = new Sheet();
  const cell = sheet.new(5);

  let cellValue = 0;
  const unsubscribe = cell.subscribe((value) => {
    cellValue = value;
  });

  // Value should initially be 5
  expect(cellValue).toBe(5);

  // Change value, the subscriber should be notified
  cell.set(10);
  expect(cellValue).toBe(10);

  // Unsubscribe and change value again, the subscriber should not be notified
  unsubscribe();
  cell.set(15);
  expect(cellValue).toBe(10);
});

test("Cell multiple subscriptions before value is available", async () => {
  const sheet = new Sheet();
  const cell = sheet.new(5);
  const delayedCell = cell.map((v) => delayed(v, 50));

  let cellValue = 0;
  const unsubscribe = delayedCell.subscribe((value) => {
    if (!(value instanceof Error)) cellValue = value;
  });

  let cellValue2 = 0;
  const unsubscribe2 = delayedCell.subscribe((value) => {
    if (!(value instanceof Error)) cellValue2 = value;
  });

  // Value should initially be 0, before delay
  expect(cellValue).toBe(0);
  expect(cellValue2).toBe(0);

  await sleep(60);

  expect(cellValue).toBe(5);
  expect(cellValue2).toBe(5);

  // Change value, the subscriber should be notified
  cell.set(10);
  await sleep(60);

  expect(cellValue).toBe(10);
  expect(cellValue2).toBe(10);

  // Unsubscribe and change value again, the subscriber should not be notified
  unsubscribe();
  unsubscribe2();

  cell.set(15);
  await sleep(60);

  expect(cellValue).toBe(10);
  expect(cellValue2).toBe(10);
});

test("Cell multiple get before value is available", async () => {
  const sheet = new Sheet();
  const cell = sheet.new(5);
  const delayedCell = cell.map((v) => delayed(v, 50));

  const cellValue = delayedCell.get();
  const cellValue2 = delayedCell.get();

  expect(await cellValue).toBe(5);
  expect(await cellValue2).toBe(5);
});

test("map cell", () => {
  const store = new Sheet();
  const count = store.new(2);
  const double = count.map((x) => x * 3);
  expect(double.value).toBe(6);
});

test("get without promises", async () => {
  const store = new Sheet();
  const count = store.new(2);
  expect(await count.get()).toBe(2);
  expect(count.subscribersCount).toBe(0);
});

test("get async with delay", async () => {
  const store = new Sheet();
  const count = store.new(delayed(2, 100));
  const v = count.get();
  // expect(count.subscribersCount).toBe(1); // get no longer uses subscription
  expect(await v).toBe(2);
  // expect(count.subscribersCount).toBe(0);
});

test("map async with delay", async () => {
  const store = new Sheet();
  // value: Cell<number> (no need to await)
  const value = store.new(delayed(2, 100));
  // prod: Cell<number>, defined before the value is available
  const prod = value.map((v) => 2 * v);
  // we await **only** when we need results
  expect(await prod.get()).toBe(4);
  // direct update (no await)
  value.set(3);
  // direct value (no await)
  expect(prod.value).toBe(6);
  // new store, not yet available
  const b = store.new(delayed(1.5, 100));
  // already map into new result
  const next = store.map([prod, b], (prod, b) => prod + b);
  // not readily available
  expect(next.value).toBeUndefined();
  // we wait to get it
  expect(await next.get()).toBe(7.5);
});

test("update sync", async () => {
  const store = new Sheet();
  const value = store.new(2);
  const double = value.map((x) => 2 * x);
  value.update((v) => delayed(v + 1, 50));
  // we still have the previous value
  expect(await value.get()).toBe(2);
  expect(await double.get()).toBe(4);
  await delayed(null, 100);
  expect(await value.get()).toBe(3);
  expect(await double.get()).toBe(6);
});

test("test single deletion", () => {
  const store = new Sheet();
  const value = store.new(2);
  const double = value.map((x) => 2 * x);
  expect(double.value).toBe(4);
  value.set(3);
  expect(double.value).toBe(6);
  const doubleId = double.id;
  store.delete(double);
  value.set(4);
  expect(double.value).toBe(6); // the detached cell is not reacting anymore
  expect(() => double.map((x) => x + 1)).toThrow(`Deleted cell: ${doubleId}`);
  // expect(alien).toBeUndefined();
});

test("test linked deletion", () => {
  const store = new Sheet();
  const value = store.new(2);
  const double = value.map((x) => 2 * x);
  const add = double.map((x) => x + 1);
  expect(() => store.delete(double)).toThrow("Cell has references");
  store.delete(double, add); // valid
  value.set(3); // will not update detached/deleted cells
  expect(double.value).toBe(4);
  expect(add.value).toBe(5);
});

test("get_before_set", async () => {
  const store = new Sheet();
  const cell = store.new(delayed(1, 200));
  expect(await cell.get()).toBe(1);
});

test("get_before_2_sets", async () => {
  const store = new Sheet();
  const cell = store.new(delayed(1, 200));
  cell.set(delayed(2, 210));
  // first computation has been invalidated,
  // we will not be notified for it
  expect(await cell.get()).toBe(2);
});
