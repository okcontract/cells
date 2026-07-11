import { expect, test } from "bun:test";

import type { AnyCell } from "./cell";
import { delayed } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

const unwrappedCell = <T>(
  proxy: SheetProxy,
  qCell: AnyCell<T>,
  name?: string
) => {
  const cell = proxy.new(undefined, name);
  const data = qCell.map((_q) => delayed({ data: _q }, 1000));
  return data.map((v) => {
    cell.set(v);
    console.log({ value: cell.value, id: cell.id });
    return cell;
  });
};

class TestClass {
  readonly contract: AnyCell<{ data: unknown }>;
  readonly mapped: AnyCell<unknown>;

  constructor(proxy: SheetProxy, widget: AnyCell<{ data: unknown }>) {
    // map on cell
    const query = widget.map((_cell) => "con:sushi/router_v2_goerli");
    // never notified
    query.subscribe((q) => {
      console.log({ q, id: query.id });
    });
    // then unwrappedCell
    this.contract = unwrappedCell(proxy, query) as AnyCell<{ data: unknown }>;
    console.log({ contract: this.contract.id });
    this.mapped = proxy.map([query, this.contract], (_q, _c) => _c);
  }
}

test("unwrappedCell in a class and wait for value", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const query = proxy.new("00718e71a9ef7e50fb44");
  const widget = unwrappedCell(proxy, query) as AnyCell<{ data: unknown }>;
  widget.subscribe((_) =>
    console.log({ widget: widget.id, value: widget.value })
  );
  const testClass = new TestClass(proxy, widget);
  await expect(testClass.contract.consolidatedValue).resolves.toHaveProperty(
    "data"
  );
});

test("a canceled dependency does not invalidate a pending value", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const map = (delay: number, dependencies: AnyCell<number>[]) =>
    proxy.mapNoPrevious(dependencies, async (...values) =>
      delayed(
        values.reduce((sum, value) => sum + value, 0),
        delay
      )
    );

  const slow = proxy.new(delayed(1, 28));
  const fast = proxy.new(delayed(1, 10));
  const fromFast = map(66, [fast]);
  const fromBoth = map(45, [slow, fast]);
  const result = map(77, [fromFast, fromBoth]);

  await expect(
    Promise.race([result.get(), delayed("timed out", 500)])
  ).resolves.toBe(3);
});
