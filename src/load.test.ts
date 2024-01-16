import { expect, test } from "vitest";

import { Cell, ValueCell, type AnyCell } from "./cell";
import { Sheet } from "./sheet";
import { SheetProxy } from "./proxy";

function getRandomNumbers(count: number, max: number): number[] {
  let numbers: number[] = [];
  for (let i = 0; i < count; i++) {
    let randomNum = Math.floor(Math.random() * max);
    numbers.push(randomNum);
  }
  return numbers;
}

test("behavior under load", async () => {
  const sheet = new Sheet();
  const store = new SheetProxy(sheet);
  const cells: AnyCell<number>[] = [];
  const start = Date.now();
  // create first 1000 number cells
  for (let i = 0; i < 1000; i++)
    cells.push(store.new(Math.floor(Math.random() * 100)));
  expect(Date.now() - start).toBeLessThan(50);
  // create 1000 mapped cells that depend on 3 random cells
  for (let i = 0; i < 1000; i++)
    cells.push(
      store.map(
        getRandomNumbers(3, 1000).map((x) => cells[x]) as [
          Cell<number, false, false>,
          Cell<number, false, false>,
          Cell<number, false, false>
        ],
        (a, b, c) => a + b + c
      )
    );
  expect(Date.now() - start).toBeLessThan(100);
  await store.wait();
  expect(Date.now() - start).toBeLessThan(100);
  for (let i = 0; i < 1000; i++) {
    // update the original cells
    (cells[i] as ValueCell<number>).set(Math.floor(Math.random() * 100));
    // retrieve any mapped cell (1000-1999) value
    await cells[i + 1000].get();
  }
  await store.wait();
  expect(Date.now() - start).toBeLessThan(500);
});
