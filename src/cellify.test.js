import { expect, test } from "vitest";
import { _cellify, _uncellify } from "./cellify";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";
test("", () => {
    // no type error
    // @todo run definitions for tests too
    const _ = true;
});
test("fix point", async () => {
    const sheet = new Sheet();
    const proxy = new SheetProxy(sheet);
    const tests = [
        {},
        "hello, world",
        { a: 1 },
        { b: [1, 2] },
        { date: new Date() },
        null
    ];
    for (let i = 0; i < tests.length; i++) {
        const v = tests[i];
        const c = _cellify(proxy, v);
        const u = await _uncellify(c);
        expect(u).toEqual(v);
    }
});
test("_cellify one", async () => {
    const sheet = new Sheet();
    const proxy = new SheetProxy(sheet);
    const res = _cellify(proxy, { a: 1 });
    const cell = await res.get();
    await expect(cell.a.get()).resolves.toBe(1);
});
