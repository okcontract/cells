import { expect, test } from "vitest";

import { isEqual } from "./isEqual.test";

import { sleep } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

test("count calls", async () => {
  const sheet = new Sheet(isEqual);
  const proxy = new SheetProxy(sheet);

  const a = proxy.new(1, "a");
  const b = a.map(async (v) => (v > 1 ? v * 2 : undefined), "b", true);
  const pointerToA = proxy.new(a, "pointer_to_a");
  const anotherPointer = proxy.new(a, "another_pointer");

  let count = 0;
  const computing = proxy.mapNoPrevious(
    // If we add anotherPointer, computing will be called three times.
    // If we use a instead of pointerToA, computing is called only once.
    [pointerToA, b, anotherPointer],
    (...arr) => {
      console.log(
        ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>   HEY I AM BEING CALLED (depOnPointerAndUndefined)",
        { arr }
      );
      count++;
      return arr;
    },
    "depOnPointerAndUndefined"
  );
  const pointerToB = proxy.new(b, "pointerToB");

  let countDepOnPointerToB = 0;
  const pointerOnPointerToCanceled = b.map((v) => {
    countDepOnPointerToB++;
  }, "pointerToB");

  let countDepOnTrace = 0;
  const depOnDep = proxy.map(
    [computing, pointerToB],
    (v) => {
      countDepOnTrace++;
      console.log(
        "...........................................   HEY I AM BEING CALLED (depOnPointerAndUndefined)",
        { v }
      );
      return v;
    },
    "depOnDep"
  );
  //                                    /----->depOnPointerToCanceled
  //             /-.-.-.-.-.->pointerToB-------------------> depOnDep
  //            /                                           /
  // a ------> b -----------> depOnPointerAndUndefined ----/
  //  | \-.-.-> pointerToA--/    /
  //   \-.-> anotherPointerToA--/

  await sleep(10);
  // hanging waits
  // await proxy.wait();
  // await sheet.wait();
  expect(count).toBe(0);
  expect(countDepOnTrace).toBe(0);
  expect(countDepOnPointerToB).toBe(0);
  console.log("===========================================================");
  // We set the a value, that should for the first time trigger `computing`.
  a.set(2);
  await sleep(10);
  expect(computing.consolidatedValue).toEqual([2, 4, 2]);
  // expect(count).toBe(1);
  const countAfter = count;
  const countDepOnTraceAfter = countDepOnTrace;
  const countDepOnPointerToBAfter = countDepOnPointerToB;
  console.log("===========================================================");

  a.set(1);
  await sleep(10);
  // hanging waits
  // await proxy.wait();
  // await sheet.wait();
  await computing.consolidatedValue;
  expect(computing.consolidatedValue).toEqual([2, 4, 2]);
  expect(count).toBe(countAfter);
  expect(countDepOnTrace).toBe(countDepOnTraceAfter);
  expect(countDepOnPointerToB).toBe(countDepOnPointerToBAfter);

  console.log("===========================================================");

  a.set(3);
  await sleep(10);
  // hanging waits
  // await proxy.wait();
  // await sheet.wait();
  await computing.consolidatedValue;
  expect(computing.consolidatedValue).toEqual([3, 6, 3]);
  expect(count).toEqual(countAfter + 1);
  expect(countDepOnTrace).toBe(countDepOnTraceAfter + 1);
  expect(countDepOnPointerToB).toBe(countDepOnPointerToBAfter + 1);
});
