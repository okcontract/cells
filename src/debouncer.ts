import type { ValueCell } from "./cell";

export type Debouncer = <T>(cb: (v: T) => void | Promise<void>, v: T) => void;

/**
 * debouncer creates a debounce function that will execute a callback after a _delay_.
 *
 * Create with `const debounce = debouncer()`
 * and use as `debounce(cb, v, delay)`.
 * @param cb callback
 * @param v value passed to callback
 * @param delay optional delay in ms, default: 750
 */
export const debouncer = (
  delay = 750,
  working: ValueCell<boolean> | undefined = undefined
): Debouncer => {
  // console.log({ setting: delay });
  let timer: ReturnType<typeof setTimeout>;
  return <T>(cb: (v: T) => void | Promise<void>, v: T) => {
    // console.log({ called: delay });
    if (working !== undefined) working.set(true);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      // console.log({ deb: delay });
      await cb(v);
      if (working !== undefined) working.set(false);
    }, delay);
  };
};
