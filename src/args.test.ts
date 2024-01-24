import { expect, test } from "vitest";

type ComputeFunction<T extends unknown[], R> = (...args: T) => R;

function compute<T extends unknown[], R>(
  fn: ComputeFunction<T, R>,
  ...data: T
): R {
  if (fn.length !== data.length) {
    throw new Error(
      `Number of arguments mismatch. Expected ${fn.length}, received ${data.length}`
    );
  }

  return fn(...data);
}

test("typescript errors", () => {
  function add(a: number, b: number): number {
    return a + b;
  }

  // Valid call
  expect(compute(add, 2, 3)).toBe(5);

  function subtract(a: number, b: number): number {
    return a - b;
  }

  // Wrong call
  expect(
    // @ts-expect-error missing argument
    () => compute(subtract, 5)
  ).throws;
});
