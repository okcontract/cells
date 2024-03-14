import { AnyCell } from "./cell";
import { Unsubscriber } from "./types";

/**
 * nextSubscriber subscribes to get the next value of a cell. This is useful
 * when a cell is already defined, but we know it will be updated (e.g. for a
 * ValueCell) and we want that next value.
 */
export const nextSubscriber = <V>(
  cell: AnyCell<V>,
  cb: (v: V) => void,
  _expectedCount = 2
) => {
  // biome-ignore lint/style/useConst: need reference
  let uns: Unsubscriber;
  let count = 0;
  uns = cell.subscribe((arg) => {
    count++;
    if (count !== _expectedCount) return;
    if (arg instanceof Error) throw arg;
    cb(arg);
    queueMicrotask(uns);
  });
};
