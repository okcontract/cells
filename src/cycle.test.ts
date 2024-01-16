import { test, expect } from "vitest";

import { Sheet } from "./sheet";
import { sleep } from "./promise";

test("should update cells without infinite loop", async () => {
  const sheet = new Sheet();
  const cell1 = sheet.new(1);
  const cell2 = cell1.map((val) => val + 1);
  const cell3 = sheet.map([cell1, cell2], (val1, val2) => val1 + val2);

  cell1.set(2); // this should trigger updates in cell2 and cell3

  // we add a delay here to allow any potential infinite loops to manifest
  await sleep(1000);

  expect(cell2.value).toBe(3);
  expect(cell3.value).toBe(5);
});

test("should not trigger updates when cell value is not changed", async () => {
  const sheet = new Sheet();
  const cell1 = sheet.new(1);
  const cell2 = cell1.map((val) => val + 1);

  let cell2UpdateCount = 0;
  cell2.subscribe(() => {
    cell2UpdateCount++;
  });

  await sheet.wait();
  expect(cell2UpdateCount).toBe(1);

  cell1.set(1); // cell1 value is not changed

  await new Promise((resolve) => setTimeout(resolve, 100));

  // cell2 update should not be triggered
  expect(cell2UpdateCount).toBe(1);
});

test("should notify subscribers when cell value is changed", async () => {
  const sheet = new Sheet();
  const cell1 = sheet.new(1);

  let notifiedValue;
  cell1.subscribe((value) => {
    notifiedValue = value;
  });

  cell1.set(2); // cell1 value is changed

  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(notifiedValue).toBe(2);
});

test("should not notify subscribers when cell value is not changed", async () => {
  const sheet = new Sheet();
  const cell1 = sheet.new(1);

  let notificationCount = 0;
  cell1.subscribe(() => {
    notificationCount++;
  });

  expect(notificationCount).toBe(1);

  cell1.set(1); // cell1 value is not changed

  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(notificationCount).toBe(1);
});

test("should unsubscribe correctly", async () => {
  const sheet = new Sheet();
  const cell1 = sheet.new(1);

  let notificationCount = 0;
  const unsubscribe = cell1.subscribe(() => {
    notificationCount++;
  });

  expect(notificationCount).toBe(1);

  cell1.set(2); // cell1 value is changed

  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(notificationCount).toBe(2);

  unsubscribe();

  cell1.set(3); // cell1 value is changed again

  await new Promise((resolve) => setTimeout(resolve, 100));

  // notificationCount should still be 1 because we unsubscribed
  expect(notificationCount).toBe(2);
});

test("should correctly update cells when their dependencies change", async () => {
  const sheet = new Sheet();
  const cell1 = sheet.new(1);
  const cell2 = sheet.new(2);
  const cell3 = sheet.map([cell1, cell2], (a, b) => a + b);

  let notifiedValue;
  cell3.subscribe((value) => {
    notifiedValue = value;
  });

  // Change the value of a dependency
  cell1.set(3);

  await new Promise((resolve) => setTimeout(resolve, 100));

  // cell3 should now be updated to reflect the change
  expect(cell3.value).toBe(5);
  expect(notifiedValue).toBe(5);

  // Change the value of another dependency
  cell2.set(4);

  await new Promise((resolve) => setTimeout(resolve, 100));

  // cell3 should now be updated to reflect the change
  expect(cell3.value).toBe(7);
  expect(notifiedValue).toBe(7);
});

test("should correctly handle asynchronous updates", async () => {
  const sheet = new Sheet();
  const cell1 = sheet.new(1);
  cell1.bless("cell1");
  const cell2 = sheet.new(2);
  cell2.bless("cell2");

  const cell3 = sheet.map([cell1, cell2], async (a, b) => {
    await new Promise((resolve) => setTimeout(resolve, 100)); // delay the computation
    return a + b;
  });
  cell3.bless("cell3");

  let notifiedValue;
  cell3.subscribe((value) => {
    notifiedValue = value;
  });
  // Check initial computation
  expect(await cell3.get()).toBe(3);
  expect(notifiedValue).toBe(3);

  // Change the value of a dependency
  cell1.set(3);

  await sheet.wait(); // wait for cell3 to finish recomputation

  // cell3 should now be updated to reflect the change
  expect(cell3.value).toBe(5);
  expect(notifiedValue).toBe(5);

  // Change the value of another dependency
  cell2.set(4);

  await sheet.wait(); // wait for cell3 to finish recomputation

  // cell3 should now be updated to reflect the change
  expect(cell3.value).toBe(7);
  expect(notifiedValue).toBe(7);
});

test("should correctly handle asynchronous updates with single notification", async () => {
  const sheet = new Sheet();
  const cell1 = sheet.new(1);
  const cell2 = sheet.new(2);

  const cell3 = sheet.map([cell1, cell2], async (a, b) => {
    await new Promise((resolve) => setTimeout(resolve, 100)); // delay the computation
    return a + b;
  });

  let notifyCount = 0;
  cell3.subscribe(() => {
    notifyCount++;
  });

  // Check initial computation
  expect(await cell3.get()).toBe(3);
  expect(notifyCount).toBe(1); // notification count should be 1

  // Change the value of a dependency
  cell1.set(3);

  // cell3 should now be updated to reflect the change
  expect(await cell3.consolidatedValue).toBe(5);

  await new Promise((resolve) => setTimeout(resolve, 20)); // wait for subscriber to be notified
  expect(notifyCount).toBe(2); // notification count should be incremented

  // Change the value of another dependency
  cell2.set(4);
  // cell3 should now be updated to reflect the change
  expect(await cell3.consolidatedValue).toBe(7);
  await new Promise((resolve) => setTimeout(resolve, 20)); // wait for subscriber to be notified
  expect(notifyCount).toBe(3); // notification count should be incremented

  expect(await cell3.consolidatedValue).toBe(7); // value should not change
  expect(notifyCount).toBe(3); // notification count should not change
});
