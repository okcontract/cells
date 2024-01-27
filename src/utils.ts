export const intersection = <T>(a: T[], b: T[]) => {
  const bs = new Set(b);
  return a.filter((item) => bs.has(item));
};
