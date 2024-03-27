import { AnyCell, MapCell, ValueCell } from "./cell";
import { SheetProxy } from "./proxy";

export type Clock = ValueCell<number> & {
  stop: () => void;
  restart: () => void;
};

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

export const clockWork = <T>(
  proxy: SheetProxy,
  clock: Clock,
  cells: AnyCell<unknown>[],
  fn: (...args: unknown[]) => T
) => {
  // n must match fn arguments
  const n = cells.length;
  let c: number;
  return proxy.map([...cells, clock], (...all) => {
    const args = all.splice(0, n);
    const [cl, prev] = all;
    console.log({ args, cl, prev });
    if (c !== undefined && c === cl) return prev; // unchanged, we wait for the next tick
    console.log({ c, cl });
    c = cl as number;
    return fn(...args);
  }) as MapCell<T, false>;
};
