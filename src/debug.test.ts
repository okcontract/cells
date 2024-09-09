import { describe, expect, it, test, vi } from "vitest";

import { Debugger, getClassNameOrType, logger } from "./debug";
import { SheetProxy } from "./proxy";
import { Sheet } from "./sheet";

test("Debugger", () => {
  const sheet = new Sheet();
  const debug = new Debugger(sheet);
  const a = sheet.new(1, undefined, "age");
  const b = sheet.new("foo", undefined, "name");
  const c = sheet.map([a, b], (_a, _b) => _a + _b.length);
  const d = c.map((_) => {
    throw new Error("no");
  });
  expect(debug.p(1)).toBe("[] ==> {1} ==> [2]");
  expect(debug.p(1, 2)).toBeUndefined();
  const errs = debug.e;
  expect(errs.length).toBe(1);
  expect(errs[0].cell).toBe(3);
  expect(debug.dot()).toBe(
    'digraph {\nsubgraph { node [style=filled,fillcolor=aquamarine]; "name (1)"; }\nsubgraph { node [style=filled,fillcolor=gold]; "age (0)";\n"undefined (2)"; }\nsubgraph { node [style=filled,fillcolor=hotpink]; "undefined (3)"; }\n  "age (0)" -> "undefined (2)";\n  "name (1)" -> "undefined (2)";\n  "undefined (2)" -> "undefined (3)";\n  "undefined (3)";\n}\n'
  );
  expect(debug.s("ag")).toEqual([
    {
      cell: 0,
      name: "age",
      value: 1
    }
  ]);
});

describe("getClassNameOrType", () => {
  it('should return "number" for a number', () => {
    expect(getClassNameOrType(42)).toBe("number");
  });

  it('should return "string" for a string', () => {
    expect(getClassNameOrType("Hello")).toBe("string");
  });

  it('should return "Array" for an array', () => {
    expect(getClassNameOrType([1, 2, 3])).toBe("Array");
  });

  it('should return "Object" for a plain object', () => {
    expect(getClassNameOrType({ key: "value" })).toBe("Object");
  });

  it('should return "null" for null', () => {
    expect(getClassNameOrType(null)).toBe("object"); // Note: `typeof null` returns "object"
  });

  it('should return "undefined" for undefined', () => {
    expect(getClassNameOrType(undefined)).toBe("undefined");
  });

  it("should return the class name for a custom class instance", () => {
    class MyClass {}
    const instance = new MyClass();
    expect(getClassNameOrType(instance)).toBe("MyClass");
  });

  it('should return "Function" for a function', () => {
    expect(getClassNameOrType(() => {})).toBe("function");
  });

  it("should return the correct constructor name for built-in objects", () => {
    expect(getClassNameOrType(new Map())).toBe("Map");
  });
});

describe("logger", () => {
  const sheet = new Sheet(); // Create the Sheet once for all tests

  it("should log the cell name and value type", () => {
    const mockConsoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    const proxy = new SheetProxy(sheet);
    const cell = proxy.new(42, "cell");

    logger(cell);

    expect(mockConsoleLog).toHaveBeenCalledWith("cell", { number: 42 });

    mockConsoleLog.mockRestore();
  });

  it("should log the cell name and processed value when fn is provided", () => {
    const mockConsoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    const proxy = new SheetProxy(sheet);
    const cell = proxy.new(42, "cell");

    const fn = (v: number) => v * 2;

    logger(cell, fn);

    expect(mockConsoleLog).toHaveBeenCalledWith("cell", { fn: 84 });

    mockConsoleLog.mockRestore();
  });

  it("should log the cell name and error type when cell is in Error", () => {
    const mockConsoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    const proxy = new SheetProxy(sheet);
    const err = new Error("Test error");
    const a = proxy.new("", "a");
    const b = a.map((v) => {
      throw err;
    }, "b");
    logger(b);
    expect(mockConsoleLog).toHaveBeenCalledWith("b", {
      Error: err
    });

    mockConsoleLog.mockRestore();
  });

  it("should log the name and value of a mapped cell", () => {
    const mockConsoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    const proxy = new SheetProxy(sheet);
    const cellA = proxy.new(1);
    const cellB = proxy.new(2);
    const mappedCell = proxy.map([cellA, cellB], (a, b) => a + b, "mappedCell");

    logger(mappedCell);

    expect(mockConsoleLog).toHaveBeenCalledWith("mappedCell", { number: 3 });

    mockConsoleLog.mockRestore();
  });
});
