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
  let run: ReturnType<typeof setInterval>;
  const start = () => {
    if (run) clearInterval(run);
    run = setInterval(() => clock.update((v) => v + 1), delay);
  };
  const stop = () => {
    if (run) clearInterval(run);
  };
  clock.stop = stop;
  clock.restart = start;
  live.subscribe((b) => (b ? start() : stop()));
  return clock;
};
