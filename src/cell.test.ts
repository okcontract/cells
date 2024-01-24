import { describe, expect, it, test } from "vitest";

import { isEqual } from "./isEqual.test";

import { Sheet } from "./sheet";

describe("writable", () => {
  it("creates a writable store", () => {
    const store = new Sheet();
    const count = store.new(0);
    const values: number[] = [];

    const unsubscribe = count.subscribe((value) => {
      values.push(value);
    });

    count.set(1);
    count.update((n) => n + 1);

    unsubscribe();

    count.set(3);
    count.update((n) => n + 1);

    expect(values).toEqual([0, 1, 2]);
  });

  it("deeply compares values with isEqual", () => {
    const obj = {};
    let called = 0;

    const sheet = new Sheet(isEqual);
    const store = sheet.new(obj);

    store.subscribe(() => {
      // console.log("calling...");
      called += 1;
    });

    // same object
    store.set(obj);
    expect(called).toBe(1);

    store.set({});
    expect(called).toBe(1);

    store.update((_) => ({}));
    expect(called).toBe(1);

    // same object
    store.update((obj) => obj);
    expect(called).toBe(1);
  });

  it("only calls subscriber once initially, including on re-subscriptions", () => {
    let num = 0;
    const sheet = new Sheet();
    const store = sheet.new((set: (unknown) => void) => set((num += 1)));

    let count1 = 0;
    let count2 = 0;

    store.subscribe(() => (count1 += 1))();
    expect(count1).toBe(1);

    const unsubscribe = store.subscribe(() => (count2 += 1));
    expect(count1).toBe(1);
    expect(count2).toBe(1);

    unsubscribe();
  });
});

describe("derived", () => {
  it("maps a single store", () => {
    const store = new Sheet();
    const a = store.new(1);
    const b = a.map((n) => n * 2);

    const values: number[] = [];

    const unsubscribe = b.subscribe((value) => {
      if (!(value instanceof Error)) values.push(value);
    });

    a.set(2);

    expect(values).toEqual([2, 4]);

    unsubscribe();

    a.set(3);
    expect(values).toEqual([2, 4]);
  });
});

describe("maps multiple stores", async () => {
  const store = new Sheet();
  const a = store.new(2);
  const b = store.new(3);
  const prod = store.map([a, b], (a, b) => a * b);

  it("initial mapped store", async () => {
    expect(prod.value).toBe(6);
  });

  const values: number[] = [];

  const unsubscribe = prod.subscribe((value) => {
    if (!(value instanceof Error)) values.push(value);
  });

  it("initial subscription value", async () => {
    expect(values).toEqual([6]);
  });

  it("updates a", async () => {
    // console.log("--set");
    a.set(4);
    // console.log("++set");
    // expect(store.cells).toEqual({ 0: 4, 1: 3, 2: 12 });
    expect(prod.value).toBe(12);
    expect(values).toEqual([6, 12]);
  });

  it("updates b", async () => {
    b.set(5);
    expect(values).toEqual([6, 12, 20]);
  });

  it("unsubscribes", async () => {
    unsubscribe();
    a.set(6);
    expect(values).toEqual([6, 12, 20]);
  });
});

test("maps with mapped stores", async () => {
  const sheet = new Sheet();
  const lastName = sheet.new("Foo" as "Foo" | "Bar");
  const firstName = sheet.map([lastName], (n) =>
    n === "Foo" ? "Jack" : "John"
  );
  const fullName = sheet.map([firstName, lastName], (a, b) => `${a} ${b}`);

  const values: string[] = [];
  const unsubscribe = fullName.subscribe((value) => {
    if (!(value instanceof Error)) values.push(value);
  });
  // should push first value: "Jack Foo"

  console.log("update");
  lastName.set("Bar");
  // should recompute firstName to John
  // should recompute fullName to John Bar
  // should push John Bar to subscribers
  expect(values).toEqual(["Jack Foo", "John Bar"]);
  unsubscribe();
});

test("prevents diamond dependency problem", () => {
  const store = new Sheet();
  const count = store.new(0);
  const values: string[] = [];

  const a = count.map((x) => "a" + x);
  const b = count.map((x) => "b" + x);
  const combined = store.map([a, b], (a, b) => a + b);

  const unsubscribe = combined.subscribe((v) => {
    if (!(v instanceof Error)) values.push(v.toString());
  });

  expect(values).toEqual(["a0b0"]);

  count.set(1);
  expect(values).toEqual(["a0b0", "a1b1"]);

  unsubscribe();
});

test("derived dependency does not update and shared ancestor updates", () => {
  const store = new Sheet();
  const root = store.new({ a: 0, b: 0 });
  const values: string[] = [];

  const a = root.map((x) => "a" + x.a);
  const b = store.map([a, root], (a, root) => "b" + root.b + a);

  const unsubscribe = b.subscribe((v) => {
    if (!(v instanceof Error)) values.push(v);
  });

  expect(values).toEqual(["b0a0"]);

  root.set({ a: 0, b: 1 });
  expect(values).toEqual(["b0a0", "b1a0"]);

  unsubscribe();
});

test("allows derived with different types", async () => {
  const store = new Sheet();
  const a = store.new("one");
  const b = store.new(1);
  const c = store.map([a, b], (a, b) => `${a} ${b}`);

  expect(c.value).toBe("one 1");

  a.set("two");
  b.set(2);
  expect(c.value).toBe("two 2");
});

/**
 * We test that a subscriber does not return `undefined` values.
 *
 * Svelte does however add a first `undefined` value when using the
 * syntactic sugar `$`. `$x` is compiled to a new value `let $x;`
 * that starts as undefined and is then updated every time the
 * subscriber emits a new value.
 * cf. https://svelte.dev/repl/aef2b834f8e64e5b9bcddccfc3a82f9c?version=4.2.9
 */
test("subscribe doesn't return undefined", async () => {
  const sheet = new Sheet();
  const url = sheet.new(undefined);
  const pat = /breeds\/([a-z\-]+)\//;
  const breed = url.map((s) => pat.exec(s)?.[1]);
  const l: (string | Error)[] = [];
  breed.subscribe((v) => l.push(v));
  url.set("");
  url.set("https://images.dog.ceo/breeds/frise-bichon/1.jpg");
  expect(l).toEqual(["frise-bichon"]); // cspell:disable-line
});
