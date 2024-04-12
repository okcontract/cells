import { expect, test } from "vitest";

import type { AnyCell } from "./cell";
import { Debugger } from "./debug";
import { isEqual } from "./isEqual.test";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

type Definition = {
  options: unknown;
  lens?: <A, B>(v: A, options: unknown) => AnyCell<B>;
};

test("group", async () => {
  const sheet = new Sheet(isEqual);
  const proxy = new SheetProxy(sheet);
  const debug = new Debugger(sheet);

  const path = ["test"];
  const definition = proxy.new(
    {
      options: undefined
    } as Definition,
    "definition"
  );
  const one = proxy.new(1, "1");
  const two = proxy.new(2, "2");
  const v = proxy.new([one, two], "v");

  const lensed = definition.map(
    async (_def) => (_def && "lens" in _def ? _def.lens(v, _def?.options) : v),
    `lensed.${path.join(".")}`
  );

  const l = proxy.map(
    [v, lensed, definition], // def used in Object case
    async (_v, _lensed, _def, prev) =>
      Array.isArray(_lensed) ? _lensed[lensed.value?.length - 1].id : -1,
    "len"
  );

  await expect(l.consolidatedValue).resolves.toBe(two.id);

  const three = proxy.new(3, "3");
  v.update((l) => [...l, three]);
  await expect(l.consolidatedValue).resolves.toBe(three.id);
});
