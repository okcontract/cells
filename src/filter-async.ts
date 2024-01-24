/**
 * filterAsync filters an array using an asynchronous predicate function.
 * @param arr
 * @param predicate function
 * @returns filtered array
 */
export async function filterAsync<T>(
  arr: T[],
  predicate: (item: T) => Promise<boolean>
): Promise<T[]> {
  const promises = arr.map(predicate);
  const results = await Promise.all(promises);
  return arr.filter((_, index) => results[index]);
}
