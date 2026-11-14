export function winners(
  values: (number | null | undefined)[],
  direction: "higher" | "lower" | "neutral",
): number[] {
  if (
    direction === "neutral" ||
    values.length < 2 ||
    values.some((x) => x == null || !Number.isFinite(x)) ||
    new Set(values).size < 2
  )
    return [];
  const best =
    direction === "higher"
      ? Math.max(...(values as number[]))
      : Math.min(...(values as number[]));
  return values.flatMap((x, i) => (x === best ? [i] : []));
}
