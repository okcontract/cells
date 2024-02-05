import { expect, test } from "vitest";

import { jsonStringify } from "./json";

const values: any[] = [
  1,
  "hello, world",
  '"and"',
  ['"and"'],
  {},
  [true, false],
  { foo: 1, bar: "charlie" },
  [1, 2, 3],
  { foo: [1, 2, 3], bar: { foo: 1, bar: "charlie" } }
  // 100n, // @todo returns "100" which is correct but we need to adapt the test
];

test("jsonStringify re-parse", async () => {
  for (let v of values) {
    expect(JSON.parse(jsonStringify(v))).toEqual(v);
  }
});

test("jsonStringify order", () => {
  expect(jsonStringify({ a: 1, b: "bar" })).toBe(
    jsonStringify({ b: "bar", a: 1 })
  );
  expect(jsonStringify({ a: { c: 100, z: 1 }, b: "bar" })).toBe(
    jsonStringify({ b: "bar", a: { z: 1, c: 100 } })
  );
});

test("jsonStringify undefined", () => {
  expect(jsonStringify({ a: 1, b: undefined })).toBe(jsonStringify({ a: 1 }));
});
