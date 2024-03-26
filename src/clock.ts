import { AnyCell, ValueCell } from "./cell";
import { SheetProxy } from "./proxy";

export const clock = (
  proxy: SheetProxy,
  live: AnyCell<boolean>,
  delay: number
) => {
  const clock = proxy.new(0) as ValueCell<number> & {
    stop: () => void;
    restart: () => void;
  };
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
