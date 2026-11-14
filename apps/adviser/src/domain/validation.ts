import {
  VALID_CATEGORIES,
  validateConfirmedProfile,
  type ConfirmedNeedsProfile,
} from "../taxonomy";
import type { ProductVariant } from "../catalog";

// Persistence guards accept unknown JSON without reading through null/arrays.
export function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function text(value: unknown): value is string {
  return typeof value === "string";
}
export function id(value: unknown): value is string {
  return text(value) && value.trim().length > 0;
}
export function amount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
export function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
export function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id);
}
export function uniqueIds(value: { id: string }[]) {
  return new Set(value.map((x) => x.id)).size === value.length;
}
export function date(value: unknown): value is string {
  if (
    !text(value) ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    return false;
  // Date.parse normalizes impossible calendar dates such as February 30.
  const day = value.slice(0, 10);
  return new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day;
}
export function url(value: unknown): value is string {
  if (!text(value)) return false;
  try {
    const u = new URL(value);
    return (
      ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
export function profile(value: unknown): value is ConfirmedNeedsProfile {
  if (
    !record(value) ||
    !id(value.category) ||
    !strings(value.orderedPurposes) ||
    !strings(value.orderedPriorities) ||
    !record(value.budget) ||
    !validateConfirmedProfile(value).valid
  )
    return false;
  const h = value.hardConstraints;
  return (
    h === undefined ||
    (record(h) &&
      (h.requiredOs === undefined || strings(h.requiredOs)) &&
      (h.minRamGb === undefined || (amount(h.minRamGb) && h.minRamGb > 0)) &&
      (h.maxWeightKg === undefined || positive(h.maxWeightKg)) &&
      (h.formFactor === undefined || id(h.formFactor)))
  );
}
export function variant(value: unknown): value is ProductVariant {
  if (
    !record(value) ||
    ![value.variantId, value.familyId, value.modelName, value.brand].every(
      id,
    ) ||
    !VALID_CATEGORIES.includes(value.category) ||
    !strings(value.factIds) ||
    new Set(value.factIds).size !== value.factIds.length ||
    !record(value.specifications)
  )
    return false;
  const s = value.specifications;
  return (
    amount(s.ramGb) &&
    s.ramGb > 0 &&
    amount(s.storageGb) &&
    s.storageGb > 0 &&
    id(s.os) &&
    id(s.cpu) &&
    (s.gpu === undefined || text(s.gpu)) &&
    [s.weightKg, s.displayInches, s.batteryWattHours].every(
      (x) => x === undefined || positive(x),
    )
  );
}
