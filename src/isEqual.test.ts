import { expect, test } from "vitest";

/**
 * isEqual is a deep equality function for JS values.
 * @param a
 * @param b
 * @returns
 */
// biome-ignore lint/suspicious/noExportsInTest: used in tests only
export function isEqual<T>(a: T, b: T): boolean {
  // Same instance or primitive values are equal
  if (a === b) return true;

  // If one of them is null or not an object, they are not equal
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  )
    return false;

  // Compare arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Compare objects
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false; // Different shape
    if (!isEqual(a[key], b[key])) return false; // Different value
  }

  return true;
}

test("isEqual", () => {
  expect(isEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBeTruthy();
  expect(isEqual({ a: 1, b: 2 }, { b: 2, a: 1, c: 2 })).toBeFalsy();
});
