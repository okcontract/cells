import { AnyCell, MapCell, ValueCell } from "./cell";
import { SheetProxy } from "./proxy";

export type Clock = ValueCell<number> & {
  stop: () => void;
  restart: () => void;
};

/**
 * clock creates a special ValueCell that updates
 * its tick every `delay`.
 */
export const clock = (
  proxy: SheetProxy,
  live: AnyCell<boolean>,
  delay: number
) => {
  const clock = proxy.new(0, "clock") as Clock;
  let run: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    if (run) clearInterval(run);
    run = undefined;
  };
  const start = () => {
    if (run) return;
    run = setInterval(() => clock.update((v) => v + 1), delay);
  };
  clock.stop = stop;
  clock.restart = start;
  live.subscribe((b) => (b ? start() : stop()));
  return clock;
};

/**
 * clockWork performs work every time the `clock` changes by
 * computing `fn` from original `cells` values.
 */
export const clockWork = <T>(
  proxy: SheetProxy,
  clock: Clock,
  cells: AnyCell<unknown>[],
  fn: (...args: unknown[]) => T
) => {
  // n must match fn arguments
  const n = cells.length;
  let prevClock: number;
  return proxy.map(
    // @ts-expect-error @todo generic types
    [...cells, clock],
    (...all) => {
      const args = all.splice(0, n);
      const [cl, prev] = all;
      // console.log({ args, cl, prev });
      if (prevClock !== undefined && prevClock === cl) return prev; // unchanged, we wait for the next tick
      // console.log({ c: prevClock, cl });
      prevClock = cl as number;
      return fn(...args, prev);
    }
  ) as MapCell<T, false>;
};
