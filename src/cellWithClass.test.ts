import { expect, test } from "vitest";

import type { AnyCell } from "./cell";
import { delayed } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";
import type { Unsubscriber } from "./types";
import { WrappedCell } from "./wrapped";

const unwrappedCell = (
  proxy: SheetProxy,
  qCell: AnyCell<unknown>,
  name?: string
) => {
  const cell = proxy.new(undefined, name);
  let uns: Unsubscriber;
  const data = proxy.map(
    [qCell],
    (_q) =>
      (_q && new WrappedCell(proxy.new(delayed({ data: _q }, 1000)), proxy)) ||
      null
  );
  data.subscribe((v) => {
    // only required for typing
    if (v instanceof Error || v === null) {
      cell.set(null);
      return;
    }
    if (uns) uns();
    uns = v.subscribe((v) => {
      cell.set(v);
    });
  });
  return cell;
};

class TestClass {
  readonly contract: AnyCell<{ data: unknown }>;
  readonly mapped: AnyCell<unknown>;

  constructor(proxy: SheetProxy, cell: AnyCell<unknown>) {
    // map on cell
    const query = cell.map((_cell) => "con:sushi/router_v2_goerli");
    // then unwrappedCell
    this.contract = unwrappedCell(proxy, query);

    this.mapped = proxy.map([query, this.contract], (_q, _c) => _c);
  }
}

test("unwrappedCell in a class and wait for value", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);

  const query = proxy.new("00718e71a9ef7e50fb44");
  const widget = unwrappedCell(proxy, query);

  const testClass = new TestClass(proxy, widget);

  await expect(testClass.mapped.consolidatedValue).resolves.toHaveProperty(
    "data"
  );
});
