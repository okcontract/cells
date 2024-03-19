import { expect, test } from "vitest";
function compute(fn, ...data) {
    if (fn.length !== data.length) {
        throw new Error(`Number of arguments mismatch. Expected ${fn.length}, received ${data.length}`);
    }
    return fn(...data);
}
test("typescript errors", () => {
    function add(a, b) {
        return a + b;
    }
    // Valid call
    expect(compute(add, 2, 3)).toBe(5);
    function subtract(a, b) {
        return a - b;
    }
    // Wrong call
    expect(
    // @ts-expect-error missing argument
    () => compute(subtract, 5)).throws;
});
