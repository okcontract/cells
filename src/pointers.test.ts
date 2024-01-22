import { writeFileSync, appendFileSync } from "fs";

import { expect, test } from "vitest";

import { delayed, sleep } from "./promise";
import { ValueCell } from "./cell";
import { Sheet } from "./sheet";
import { SheetProxy } from "./proxy";

test("cell pointer sync", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const cell1 = proxy.new(delayed(1, 100), "init");
  const cellMap = cell1.map((x) => proxy.new(x + 2), "cell1");
  const mixed = proxy.map([cell1, cellMap], (a, b) => a + b, "mixed");
  await expect(cellMap.get()).resolves.toEqual(3);
  expect(cellMap.isPointer).toEqual(true);
  await expect(mixed.get()).resolves.toEqual(4);
  cell1.set(2);
  // await sleep(160);
  await expect(mixed.get()).resolves.toEqual(6);
});

test("cell pointer async", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const cell1 = proxy.new(delayed(1, 100), "init");
  const cellMap = cell1.map((x) => proxy.new(x + 2), "cell1");
  const mixed = proxy.map(
    [cell1, cellMap],
    async (a, b) => delayed(a + b, 150),
    "mixed"
  );
  await expect(cellMap.get()).resolves.toEqual(3);
  expect(cellMap.isPointer).toEqual(true);
  await expect(mixed.get()).resolves.toEqual(4);
  cell1.set(2);
  // This gives the expected result.
  // await sleep(160);
  await mixed.working;
  await expect(mixed.get()).resolves.toEqual(6);
});

test("cell pointer async initially undefined", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const cell1 = proxy.new<number>(undefined as any, "init");
  const cellMap = cell1.map((x) => proxy.new(x + 2), "cell1");
  cell1.set(1);
  expect(cellMap.isPointer).toEqual(true);
  await expect(cellMap.get()).resolves.toEqual(3);

  const mixed = proxy.map(
    [cell1, cellMap],
    async (a, b) => delayed(a + b, 150),
    "mixed"
  );
  await expect(mixed.get()).resolves.toEqual(4);
});

test("cell pointer chain", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const cell1 = proxy.new(delayed(1, 100), "init");
  const cellMap = cell1.map((x) => proxy.new(x + 2), "cell1");
  const mixed = proxy.map(
    [cell1, cellMap],
    async (a, b) => delayed(proxy.new(a + b), 150),
    "mixed"
  );

  await expect(cellMap.get()).resolves.toEqual(3);
  expect(cellMap.isPointer).toEqual(true);
  await expect(mixed.get()).resolves.toEqual(4);
  cell1.set(2);
  await mixed.working;
  await expect(mixed.get()).resolves.toEqual(6);
});

test("cell pointer longer chain", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const init = proxy.new(delayed(1, 100), "init");
  const cellMap = init.map(
    (x) => proxy.new(x + 2, "cellMap_" + x),
    "cellMap",
    true
  );
  const mixed = proxy.map(
    [init, cellMap],
    async (a, b) => delayed(proxy.new(a + b, "mixed_" + a + "_" + b), 150),
    "mixed",
    true
  );
  let successiveValues: number[] = [];
  mixed.subscribe((v) => successiveValues.push(v));
  const double = mixed.map(
    async (v) => proxy.new(v * 2, "double_" + v),
    "double"
  );

  await expect(cellMap.get()).resolves.toEqual(3);
  expect(cellMap.isPointer).toEqual(true);
  await expect(mixed.get()).resolves.toEqual(4);
  expect(double.get()).resolves.toEqual(8);

  writeFileSync("dependencies.dot", sheet.dotGraphWithTitle("first topology"));
  console.log(sheet.dotGraph);

  init.set(2);

  await proxy.working.wait();
  await cellMap.working;
  appendFileSync(
    "dependencies.dot",
    sheet.dotGraphWithTitle("second topology")
  );

  // console.log(sheet.dotGraph);
  // // This loop seems to spam so hard that the update never progress to the expected value
  // let cpt = 0;
  // while (!((await mixed.get()) === 6)) {
  //   console.log({ cpt: cpt++ });
  // }
  expect(mixed.consolidatedValue).toEqual(6);
  await sleep(200);
  expect(double.consolidatedValue).toEqual(12);
  expect(successiveValues).toEqual([4, 6]);
  appendFileSync("dependencies.dot", sheet.dotGraphWithTitle("last topology"));
});

test("cell pointer, incremental computation", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const init1: ValueCell<number> = proxy.new(1, "init1");
  const cellPointer1: ValueCell<number> = proxy.new(init1, "pointer1");
  const depOnPointer = proxy.map([cellPointer1], (a) => a + 1, "depOnPointer");

  await expect(depOnPointer.get()).resolves.toEqual(2);

  writeFileSync(
    "depWTF.dot",
    sheet.dotGraphWithTitle("topology before updatable selection")
  );
  const { updatable, pointersToBeUpdated, grey, mightChange: toBeUpdated } =
    //@ts-expect-error accessing private method
    sheet.selectUpdatableCells(
      new Set([init1.id]),
      (id: number) => sheet.get(id).isPointer
    );

  expect({ updatable, pointersToBeUpdated, grey, toBeUpdated }).toEqual({
    updatable: [cellPointer1.id],
    pointersToBeUpdated: [cellPointer1.id],
    grey: [depOnPointer.id],
    toBeUpdated: [depOnPointer.id, cellPointer1.id],
  });
  init1.set(2);
  expect(depOnPointer.consolidatedValue).toEqual(3);
});

test("cell pointer, update pointed", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const init1 = proxy.new(delayed(1, 100), "init1");
  const cellPointer1: ValueCell<number> = proxy.new(
    delayed(init1, 15),
    "pointer1"
  );
  const depOnPointer = proxy.map(
    [cellPointer1],
    async (a) => delayed(a + 1, 150),
    "depOnPointer"
  );

  await expect(depOnPointer.get()).resolves.toEqual(2);

  init1.set(2);
  await expect(depOnPointer.consolidatedValue).resolves.toEqual(3);
});

test("cell pointer long chain, update pointed", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const init1: ValueCell<number> = proxy.new(delayed(1, 100), "init1");
  const cellPointer1 = proxy.new(delayed(init1, 15), "pointer1");
  const cellPointer2 = proxy.new(delayed(cellPointer1, 15), "pointer2");
  const cellPointer3 = proxy.new(delayed(cellPointer2, 15), "pointer3");
  const cellPointer4 = proxy.new(delayed(cellPointer3, 15), "pointer4");
  const depOnPointer = proxy.map(
    [cellPointer4],
    async (a) => delayed(a + 1, 1),
    "depOnPointer"
  );
  const depPointer1 = proxy.new(delayed(depOnPointer, 15), "depPointer1");
  const depOnDepPointer = proxy.map([depPointer1], (v) => v, "pointer3");
  const depDepPointer = proxy.new(depOnDepPointer, "pointer4");

  await expect(depDepPointer.get()).resolves.toEqual(2);

  init1.set(2);
  await sleep(200);
  expect(depDepPointer.consolidatedValue).toEqual(3);
});

test("cell pointer long chain, update pointed with null", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const init1 = proxy.new(delayed(1 as number | null, 100), "init1");
  const cellPointer1 = proxy.new(delayed(init1, 15), "pointer1");
  const cellPointer2 = proxy.new(delayed(cellPointer1, 15), "pointer2");
  const cellPointer3 = proxy.new(delayed(cellPointer2, 15), "pointer3");
  const cellPointer4 = proxy.new(delayed(cellPointer3, 15), "pointer4");
  const depOnPointer = proxy.map(
    [cellPointer4],
    async (a) => delayed(a, 150),
    "depOnPointer"
  );

  await expect(depOnPointer.get()).resolves.toEqual(1);

  init1.set(null);
  await expect(depOnPointer.consolidatedValue).resolves.toEqual(null);
});

test("cell pointer long chain, update pointer", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const init1 = proxy.new(delayed(1, 100), "init1");
  const init2 = proxy.new(2, "init2");
  const cellPointer1 = proxy.new(delayed(init1, 15), "pointer1");
  const cellPointer2 = proxy.new(delayed(cellPointer1, 15), "pointer2");
  const depOnPointer = proxy.map(
    [cellPointer2],
    async (a) => delayed(a + 1, 150),
    "depOnPointer",
    true
  );
  const valuesOfDepOnPointer: number[] = [];
  depOnPointer.subscribe((v) => {
    valuesOfDepOnPointer.push(v);
  });

  await expect(depOnPointer.get()).resolves.toEqual(2);
  expect(valuesOfDepOnPointer).toEqual([2]);

  writeFileSync(
    "updated_pointers.dot",
    sheet.dotGraphWithTitle("init topology")
  );
  cellPointer2.set(init2);
  appendFileSync(
    "updated_pointers.dot",
    sheet.dotGraphWithTitle("updated topology")
  );
  await expect(cellPointer2.get()).resolves.toEqual(2);
  await expect(depOnPointer.consolidatedValue).resolves.toEqual(3);

  //@todo this is just a hack to restart promises computations and trigger subscribers notifications
  await expect(delayed(1, 1)).resolves.toEqual(1);
  expect(valuesOfDepOnPointer).toEqual([2, 3]);
  cellPointer2.set(init1);
  appendFileSync(
    "updated_pointers.dot",
    sheet.dotGraphWithTitle("last topology")
  );
  await expect(cellPointer2.get()).resolves.toEqual(1);
  await expect(depOnPointer.consolidatedValue).resolves.toEqual(2);
  await expect(delayed(1, 1)).resolves.toEqual(1);
  expect(valuesOfDepOnPointer).toEqual([2, 3, 2]);
});

test("map with pointers should be called once", async () => {
  const proxy = new Sheet().newProxy();
  // if a is sync, the test passes
  const a = proxy.new(delayed(1, 10));
  const b = proxy.new(2);
  let countM = 0;
  const m = proxy.map([a, b], (a, b) => {
    countM++;
    return a + b;
  });
  let countP = 0;
  const p = m.map((v) => {
    countP++;
    return v < 2 ? a : b;
  });
  let countMP = 0;
  const mp = p.map((v) => {
    countMP++;
    return v;
  });
  await proxy.working.wait();
  expect(await mp.get()).toBe(2);
  expect(countM).toBe(1);
  expect(countP).toBe(1);
  expect(countMP).toBe(1);
});
