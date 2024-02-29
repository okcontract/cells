import type { AnyCell } from "./cell";
import type { SheetProxy } from "./proxy";

/**
 * collector returns a function that automatically collects a cell
 * each time it is re-created.
 */
export const collector = <C extends AnyCell<unknown>>(proxy: SheetProxy) => {
  let prev: C;
  return (v: C) => {
    // mark the previous value for deletion
    if (prev) proxy._sheet.collect(prev);
    prev = v;
    return v;
  };
};

/**
 * reuse previously mapped cell only if same fn.
 */
export const reuseOrCreate = <T>(
  cond: boolean,
  reuse: () => T,
  create: () => T
): T => (cond ? reuse() || create() : create());
