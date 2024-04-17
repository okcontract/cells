import type { AnyCell, ValueCell } from "./cell";
import type { SheetProxy } from "./proxy";

// Copy any Cell as a ValueCell.
export const copy = <T>(
  proxy: SheetProxy,
  cell: AnyCell<T>,
  name = `copy:${cell.id}`
): ValueCell<T> => {
  return proxy.new(
    new Promise((resolve, reject) => {
      cell.get().then((v) => (v instanceof Error ? reject(v) : resolve(v)));
    }),
    name
  );
};
