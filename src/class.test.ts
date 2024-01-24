import { expect, test } from "vitest";

import { Cell, MapCell, ValueCell } from "./cell";
import { Sheet } from "./sheet";

const sheet = new Sheet();
const vCell = sheet.new(1);
const mCell = vCell.map((val) => val + 1);

test("Cells class hierarchy", async () => {
  expect(vCell instanceof ValueCell).toBe(true);
  expect(vCell instanceof Cell).toBe(true);
  expect(vCell instanceof MapCell).toBe(false);

  expect(mCell instanceof MapCell).toBe(true);
  expect(mCell instanceof Cell).toBe(true);
  expect(mCell instanceof ValueCell).toBe(false);
});

test("Cells casting", async () => {
  // main purpose here is to have typing error
  // in case this casting is not valid anymore
  const vCell2: Cell<number, false, false, false> = vCell;
  const mCell2: MapCell<number, false> = mCell;

  expect(vCell2 instanceof ValueCell).toBe(true);
  expect(vCell2 instanceof Cell).toBe(true);
  expect(vCell2 instanceof MapCell).toBe(false);

  expect(mCell2 instanceof MapCell).toBe(true);
  expect(mCell2 instanceof Cell).toBe(true);
  expect(mCell2 instanceof ValueCell).toBe(false);
});
