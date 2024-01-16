import { expect, test } from "vitest";

import { delayed } from "./promise";
import { Sheet } from "./sheet";
import { SheetProxy } from "./proxy";

test("native proxy", () => {
  const obj = {
    value: 0,
  };

  let trigger = false;

  const proxy = new Proxy(obj, {
    deleteProperty(target: any, property) {
      trigger = true;
      delete target[property];
      return true;
    },
  });

  proxy.value = 10; // Output: (nothing is logged)
  expect(proxy.value).toBe(10);
  expect(trigger).toBeFalsy();

  delete (proxy as any).value; // Output: "Property has been deleted: value"
  expect(proxy.value).toBeUndefined(); // Output: undefined
  expect(trigger).toBeTruthy();
});

test("SheetProxy", () => {
  const store = new Sheet();
  const value = store.new(2);
  const proxy = new SheetProxy(store);
  const double = proxy.map([value], (x) => 2 * x);
  const add = proxy.map([double], (x) => x + 1);
  proxy.destroy();
  value.set(3); // will not update detached/deleted cells
  expect(double.value).toBe(4);
  expect(add.value).toBe(5);
});

test("Sheet multiple async updates", async () => {
  const store = new Sheet();
  const value = store.new(2);
  const double = value.map(async (x) => delayed(2 * x, 50));
  const add = store.map([value, double], (value, double) =>
    delayed(value + double + 1, 30)
  );
  // console.log("value", value.id, "double", double.id, "add", add.id);
  let val = await add.get(); // get returns the last computed value, wait if undefined
  expect(val).toBe(7);
  value.set(3);
  expect(await add.consolidatedValue).toBe(10);
  value.set(4);
  await store.wait();
  expect(await add.consolidatedValue).toBe(13);
});

test("SheetProxy multiple async updates", async () => {
  const sheet = new Sheet();
  const store = new SheetProxy(sheet);
  const value = store.new(2);
  const double = value.map(async (x) => delayed(2 * x, 100));
  const add = store.map([value, double], (value, double) =>
    delayed(value + double + 1, 30)
  );
  expect(await add.get()).toBe(7);
  value.set(3);
  expect(await add.get()).toBe(7); // last computed value, do not wait ongoing computation
  expect(await add.consolidatedValue).toBe(10); // wait ongoing computation
});

test("proxy wait only on proxy's cells", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const sheetCell = sheet.new(delayed(1, 200));
  await proxy.wait();
  expect(sheetCell.value).toBeUndefined();
  const proxyCell = proxy.new(delayed(1, 100));
  await proxy.wait();
  expect(sheetCell.value).toBeUndefined();
  expect(proxyCell.value).toBe(1);
  const proxyLongCell = proxy.new(delayed(1, 200));
  await sheet.wait();
  expect(sheetCell.value).toBe(1);
  expect(proxyCell.value).toBe(1);
  expect(proxyLongCell.value).toBe(1);
});
