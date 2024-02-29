import { describe, expect, it } from "vitest";

import { intersection } from "./utils";

describe("intersection function", () => {
  it("returns the correct intersection of two arrays with common elements", () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  it("returns an empty array when there are no common elements", () => {
    expect(intersection([1, 2, 3], [4, 5, 6])).toEqual([]);
  });

  it("handles identical arrays correctly", () => {
    expect(intersection([1, 2, 3], [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("returns an empty array when one or both input arrays are empty", () => {
    expect(intersection([], [1, 2, 3])).toEqual([]);
    expect(intersection([1, 2, 3], [])).toEqual([]);
    expect(intersection([], [])).toEqual([]);
  });

  it("correctly handles duplicates in the input arrays", () => {
    expect(intersection([1, 2, 2, 3], [2, 2, 3, 4])).toEqual([2, 2, 3]);
  });
});
