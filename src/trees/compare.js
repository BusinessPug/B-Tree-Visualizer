// Default three-way comparator used when callers do not supply one.
// Works for any value-type that supports `<` and `>` (numbers, strings).
export const defaultCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
