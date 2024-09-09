import type { AnyCell, MapCell } from "./cell";
import type { SheetProxy } from "./proxy";

export const initialValue = <T>(
  proxy: SheetProxy,
  v0: T | AnyCell<T>,
  v: AnyCell<T>,
  name = "initial"
): MapCell<T, true> => {
  const cell = proxy.new(v0, name);
  v.subscribe((v) => {
    // We do not propagate errors yet.
    if (v instanceof Error || v === null) return;
    cell.set(v);
  });
  // We fake being a MapCell to prevent setting the cell
  // outside of this function.
  return cell as unknown as MapCell<T, true>;
};
