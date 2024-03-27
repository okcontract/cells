import { AnyCell, MapCell, ValueCell } from "./cell";
import { SheetProxy } from "./proxy";

export type Clock = ValueCell<number> & {
  stop: () => void;
  restart: () => void;
  work: <T, NF extends boolean = false>(
    cells: AnyCell<unknown>[],
    fn: (...args: unknown[]) => T,
    name?: string,
    nf?: NF
  ) => MapCell<T, NF>;
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
  clock.work = (cells, fn, name, nf) =>
    clockWork(proxy, clock, cells, fn, name, nf);
  live.subscribe((b) => (b ? start() : stop()));
  return clock;
};

/**
 * clockWork performs work every time the `clock` changes by
 * computing `fn` from original `cells` values.
 */
export const clockWork = <T, NF extends boolean = false>(
  proxy: SheetProxy,
  clock: Clock,
  cells: AnyCell<unknown>[],
  fn: (...args: unknown[]) => T,
  name = "work",
  nf?: NF
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
      // unchanged, we wait for the next tick
      if (prevClock !== undefined && prevClock === cl) return prev as T;
      prevClock = cl as number;
      return fn(...args, prev);
    },
    name,
    nf
  ) as MapCell<T, NF>;
};
