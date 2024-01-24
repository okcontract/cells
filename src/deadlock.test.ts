import { expect, test } from "vitest";

import { type AnyCell } from "./cell";
import { delayed } from "./promise";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

const unwrappedCell = (
  proxy: SheetProxy,
  qCell: AnyCell<any>,
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
  readonly contract: AnyCell<{ data: any }>;
  readonly mapped: AnyCell<any>;

  constructor(proxy: SheetProxy, widget: AnyCell<{ data: any }>) {
    // map on cell
    const query = widget.map((_cell) => "con:sushi/router_v2_goerli");
    // never notified
    query.subscribe((q) => {
      console.log({ q, id: query.id });
    });
    // then unwrappedCell
    this.contract = unwrappedCell(proxy, query) as AnyCell<{ data: any }>;
    console.log({ contract: this.contract.id });
    this.mapped = proxy.map([query, this.contract], (_q, _c) => _c);
  }
}

test("unwrappedCell in a class and wait for value", async () => {
  const sheet = new Sheet();
  const proxy = new SheetProxy(sheet);
  const query = proxy.new("00718e71a9ef7e50fb44");
  const widget = unwrappedCell(proxy, query) as AnyCell<{ data: any }>;
  widget.subscribe((_) =>
    console.log({ widget: widget.id, value: widget.value })
  );
  const testClass = new TestClass(proxy, widget);
  await expect(testClass.contract.consolidatedValue).resolves.toHaveProperty(
    "data"
  );
});
