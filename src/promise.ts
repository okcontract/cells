/** timeout is a promise-based setTimeout call */
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * delayed value
 * @param value to return
 * @param ms delay in ms (1sec by default)
 * @returns
 */
export const delayed = async <T>(value: T, ms = 1000): Promise<T> =>
  new Promise<T>((resolve) => {
    setTimeout(() => {
      resolve(value);
    }, ms);
  });

/**
 * Helper to either bind a computation to a promise or directly compute on unboxed values
 *
 * @param v  value or promise over which the computation is dispatched
 * @param f  computation to apply to the value
 * @param onRejection default to identity function
 * @returns
 */
export function dispatch<T1, T2>(
  v: T1 | Promise<T1>,
  f: (v: T1) => T2 | Promise<T2>,
  onRejection = (error: any) => Promise.reject(error)
): T2 | Promise<T2> {
  if (v instanceof Promise) {
    return v.catch(onRejection).then(f);
  } else {
    return f(v);
  }
}

/**
 * Same as dispatch but on arrays (of promise|value).
 * If any value of the array is a promise, wait for all values of the array,
 * else immediately compute f
 *
 * @param a the array of values
 * @param f a function to apply to resolved values
 * @param onRejection a function to handle rejection(propagate them by default)
 * @returns application of [f] to resolved values of [a], or a promise thereof
 */
export function dispatchPromiseOrValueArray<T1, T2>(
  a: (T1 | Promise<T1>)[],
  f: (v: T1[]) => T2 | Promise<T2>,
  onRejection = (error: any) => Promise.reject(error)
): T2 | Promise<T2> {
  const indexPromise = a.findIndex((v) => v instanceof Promise);
  if (indexPromise !== -1) {
    // if one deps is a promise, make a promise of them all
    const all: Promise<T1[]> = Promise.all(
      a.map((v) => (v instanceof Promise ? v : Promise.resolve(v)))
    );
    return all.catch(onRejection).then(f);
  } else {
    // no value is a promise, but the type system can't figure this out
    // alternatively, to please the typechecker we could map and return error on promise,
    // but it has a cost at runtime.
    // @ts-expect-error
    const all: T1[] = a;
    return f(all);
  }
}

export function waitAll(array: any[]): Promise<void> | void {
  let res: Promise<void> | void;
  for (const iterator of array) {
    res = dispatch(res, () => dispatch(iterator, (_) => {}));
  }
  return res;
}
