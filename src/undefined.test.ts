import { expect, test } from "vitest";

import { delayed, sleep } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

test("map with undefined", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const a = proxy.new(1, "a");
  const b = a.map(async (v) => (v > 1 ? v * 2 : undefined), "b", true);
  const c = proxy.map(
    [a, b],
    async (a, b) => {
      console.log({ a, b });
      return delayed(a + b, 10);
    },
    "c",
    true
  );
  const l: number[] = [];
  c.subscribe((v) => {
    console.log({ v });
    // @todo subscribe should consider noFail
    // @ts-expect-error no error management
    l.push(v);
  });

  expect(b.value).toBeUndefined();

  setTimeout(() => a.set(2), 50);
  await expect(b.get()).resolves.toBe(4);
  await expect(c.get()).resolves.toBe(6);

  a.set(1);
  expect(a.value).toBe(1);
  a.set(3);

  await c.working;

  await expect(b.get()).resolves.toBe(6);
  await expect(c.get()).resolves.toBe(9);

  await proxy.working.wait();

  expect(l).toEqual([6, 9]);
});

test("map with undefined without third mapping no sleep", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const a = proxy.new(1, "a");
  const b = a.map(async (v) => (v > 1 ? v * 2 : undefined), "b", true);

  expect(b.value).toBeUndefined();

  setTimeout(() => a.set(2), 50);
  await expect(b.get()).resolves.toBe(4);

  a.set(1);
  expect(a.value).toBe(1);

  // @todo we return the previous value, because b is not updated yet
  await expect(b.get()).resolves.toBe(4);
});

test("map with undefined without third mapping, with sleep", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const a = proxy.new(1, "a");
  const b = a.map(async (v) => (v > 1 ? v * 2 : undefined), "b", true);

  expect(b.value).toBeUndefined();

  setTimeout(() => a.set(2), 50);
  await expect(b.get()).resolves.toBe(4);

  a.set(1);
  expect(a.value).toBe(1);
  // setTimeout(() => a.set(3), 50);

  await sleep(10);
  await expect(b.get()).resolves.toBe(4);
});

test("map with undefined with pointers in the way", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  console.log("=========================================");
  console.log("======== build graph 'a'=1 ==============");
  console.log("=========================================");
  const a = proxy.new(1, "a");
  const b = a.map(async (v) => (v > 1 ? v * 2 : undefined), "b", true);
  const pointerToA = proxy.new(a, "pointer_to_a");
  const depOnPointerAndUndefined = proxy.mapNoPrevious(
    [pointerToA, b],
    (...arr) => arr,
    "depOnPointerAndUndefined"
  );
  const pointerOnDep = proxy.new(depOnPointerAndUndefined, "pointerOnDep");
  const depOnDepTrace = [];
  const depOnDep = proxy.map(
    [depOnPointerAndUndefined],
    (v) => {
      depOnDepTrace.push(v);
      console.log({ depOnDep: v });
      return v;
    },
    "depOnDep"
  );

  // a ------> b -----------> depOnPointerAndUndefined -.-.-> pointerOnDep
  //   \-.-.-> pointerToA--/                          \----> depOnDep

  const notifiedValues = {
    a: [],
    b: [],
    pointerToA: [],
    depOnPointerAndUndefined: [],
    pointerOnDep: [],
    depOnDep: []
  };
  a.subscribe((v) => notifiedValues.a.push(v));
  b.subscribe((v) => notifiedValues.b.push(v));
  pointerToA.subscribe((v) => notifiedValues.pointerToA.push(v));
  depOnPointerAndUndefined.subscribe((v) =>
    notifiedValues.depOnPointerAndUndefined.push(v)
  );
  pointerOnDep.subscribe((v) => {
    console.log("=>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> I'M NOTIFIED");
    notifiedValues.pointerOnDep.push(v);
  });
  depOnDep.subscribe((v) => notifiedValues.depOnDep.push(v));

  expect(b.value).toBeUndefined();
  await expect(pointerToA.get()).resolves.toEqual(1);
  expect(depOnPointerAndUndefined.value).toBeUndefined();

  setTimeout(() => {
    a.set(2);
    console.log("=========================================");
    console.log("======== Set 'a' To 2 ===================");
    console.log("=========================================");
  }, 10);
  expect(depOnPointerAndUndefined.value).toBeUndefined();
  console.log("Waiting for depOnPointerAndUndefined to be notified");
  await expect(depOnPointerAndUndefined.get()).resolves.toEqual([2, 4]);
  await expect(b.get()).resolves.toEqual(4);
  expect(depOnDepTrace).toEqual([[2, 4]]);

  expect(notifiedValues).toEqual({
    a: [1, 2],
    b: [4],
    pointerToA: [1, 2],
    depOnPointerAndUndefined: [[2, 4]],
    pointerOnDep: [[2, 4]],
    depOnDep: [[2, 4]]
  });
  console.log("=========================================");
  console.log("======== Set 'a' To 1 ===================");
  console.log("=========================================");

  a.set(1);
  await sheet.wait();
  expect(depOnPointerAndUndefined.consolidatedValue).toEqual([2, 4]);
  await expect(b.get()).resolves.toEqual(4);
  console.log({ notifiedValues });

  expect(notifiedValues).toEqual({
    a: [1, 2, 1],
    b: [4],
    pointerToA: [1, 2, 1],
    depOnPointerAndUndefined: [[2, 4]],
    pointerOnDep: [[2, 4]],
    depOnDep: [[2, 4]]
  });
  expect(depOnDepTrace).toEqual([[2, 4]]);

  expect(a.value).toBe(1);
  setTimeout(() => {
    a.set(3);

    console.log("=========================================");
    console.log("======== Set 'a' To 3 ===================");
    console.log("=========================================");
  }, 100);
  await sleep(10);

  await expect(depOnPointerAndUndefined.get()).resolves.toEqual([2, 4]);
  await expect(depOnDep.get()).resolves.toEqual([2, 4]);
  await expect(b.get()).resolves.toEqual(4);
  await sleep(100);
  console.log({ notifiedValues });

  expect(depOnPointerAndUndefined.consolidatedValue).toEqual([3, 6]);
  expect(b.value).toEqual(6);

  expect(depOnDepTrace).toEqual([
    [2, 4],
    [3, 6]
  ]);

  expect(notifiedValues).toEqual({
    a: [1, 2, 1, 3],
    b: [4, 6],
    pointerToA: [1, 2, 1, 3],
    depOnPointerAndUndefined: [
      [2, 4],
      [3, 6]
    ],
    pointerOnDep: [
      [2, 4],
      [3, 6]
    ],
    depOnDep: [
      [2, 4],
      [3, 6]
    ]
  });
}, 5000); // can increase test duration due to the mass of logs on slow devices
