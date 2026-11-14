export function destination(
  value: unknown,
): "advisor" | "compare" | "carts" | "settings" {
  if (value === "saved") return "carts";
  if (value === "explore") return "advisor";
  return ["advisor", "compare", "carts", "settings"].includes(value as string)
    ? (value as "advisor" | "compare" | "carts" | "settings")
    : "advisor";
}
