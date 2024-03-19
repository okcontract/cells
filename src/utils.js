export const intersection = (a, b) => {
    const bs = new Set(b);
    return a.filter((item) => bs.has(item));
};
