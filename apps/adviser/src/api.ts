import type { RecommendationResponseEnvelope } from "./envelope";
import type { ConfirmedNeedsProfile } from "./model";
import { safeEndpoint } from "./model";
import type { SnapshotManifest } from "./catalog";

export async function parseJsonSafe(response: Response): Promise<any> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadCatalog(
  endpoint: string,
  signal: AbortSignal,
): Promise<SnapshotManifest> {
  if (!safeEndpoint(endpoint)) throw new Error("INVALID_CATALOG_ENDPOINT");
  const response = await fetch(
    endpoint.replace(/\/+$/, "") + "/advisor/v1/catalog",
    { signal },
  );
  const data = await parseJsonSafe(response);
  if (!response.ok)
    throw new Error(data?.error?.message ?? "CATALOG_UNAVAILABLE");
  if (
    !data ||
    data.schemaVersion !== "1.0.0" ||
    typeof data.catalogVersion !== "string" ||
    !data.catalogVersion.trim() ||
    typeof data.ruleVersion !== "string" ||
    !data.ruleVersion.trim() ||
    typeof data.publishedAt !== "string" ||
    !Array.isArray(data.variants) ||
    !Array.isArray(data.offers) ||
    !Array.isArray(data.facts) ||
    !data.variants.every(
      (variant: any) =>
        typeof variant?.variantId === "string" &&
        variant.variantId.trim().length > 0 &&
        typeof variant?.modelName === "string" &&
        variant.modelName.trim().length > 0 &&
        typeof variant?.brand === "string" &&
        variant.brand.trim().length > 0 &&
        Array.isArray(variant?.factIds) &&
        typeof variant?.specifications?.cpu === "string" &&
        variant.specifications.cpu.trim().length > 0 &&
        typeof variant?.specifications?.os === "string" &&
        variant.specifications.os.trim().length > 0 &&
        (variant?.specifications?.ramGb === null ||
          (Number.isSafeInteger(variant?.specifications?.ramGb) &&
            variant.specifications.ramGb > 0)) &&
        (variant?.specifications?.storageGb === null ||
          (Number.isSafeInteger(variant?.specifications?.storageGb) &&
            variant.specifications.storageGb > 0)),
    )
  )
    throw new Error("INVALID_CATALOG_RESPONSE");
  return data as SnapshotManifest;
}
export interface ExplanationResponse {
  requestId: string;
  variantId: string;
  provider: string;
  model: string | null;
  isFallback: boolean;
  fallbackReason: string | null;
  lines: string[];
}
export async function explain(
  endpoint: string,
  variantId: string,
  profile: ConfirmedNeedsProfile,
  requestId: string,
  question: string,
  signal: AbortSignal,
): Promise<ExplanationResponse> {
  if (!safeEndpoint(endpoint))
    throw new Error("Dùng HTTPS hoặc địa chỉ máy chủ cục bộ hợp lệ.");
  const asked = question.trim();
  const res = await fetch(
    endpoint.replace(/\/+$/, "") + "/advisor/v1/explain",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        requestId,
        variantId,
        profile,
        ...(asked ? { question: asked } : {}),
      }),
    },
  );
  const data = await parseJsonSafe(res);
  if (!res.ok)
    throw new Error(data?.error?.message ?? "Không thể tải tư vấn AI.");
  if (
    !data ||
    data.requestId !== requestId ||
    data.variantId !== variantId ||
    typeof data.provider !== "string" ||
    !(data.model === null || typeof data.model === "string") ||
    typeof data.isFallback !== "boolean" ||
    !(
      data.fallbackReason === null || typeof data.fallbackReason === "string"
    ) ||
    !Array.isArray(data.lines) ||
    !data.lines.length ||
    !data.lines.every((line: unknown) => typeof line === "string")
  )
    throw new Error("Phản hồi tư vấn không hợp lệ.");
  return data;
}
export async function recommend(
  endpoint: string,
  profile: ConfirmedNeedsProfile,
  revision: number,
  requestId: string,
  signal: AbortSignal,
  catalogVersion = "retail-dev-2026-11-14",
  ruleVersion = "2026.11",
): Promise<RecommendationResponseEnvelope> {
  if (!safeEndpoint(endpoint))
    throw new Error("Dùng HTTPS hoặc địa chỉ máy chủ cục bộ hợp lệ.");
  const res = await fetch(
    endpoint.replace(/\/+$/, "") + "/advisor/v1/recommend",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        schemaVersion: "1.0.0",
        ruleVersion,
        catalogVersion,
        requestId,
        decisionId: "local-decision",
        profileRevision: revision,
        profile,
      }),
    },
  );
  const data = await parseJsonSafe(res);
  if (!res.ok) throw new Error(data?.error?.message ?? "Không thể tải kết quả.");
  if (
    !data ||
    data.schemaVersion !== "1.0.0" ||
    data.ruleVersion !== ruleVersion ||
    data.requestId !== requestId ||
    data.profileRevision !== revision ||
    !Array.isArray(data.shortlist) ||
    !Array.isArray(data.excludedVariants) ||
    !data.shortlist.every(
      (x: any) =>
        typeof x.variantId === "string" &&
        typeof x.modelName === "string" &&
        (x.totalVnd === null ||
          (Number.isSafeInteger(x.totalVnd) && x.totalVnd >= 0)) &&
        typeof x.isVerifiedAffordable === "boolean" &&
        !(x.isVerifiedAffordable && x.totalVnd === null) &&
        Array.isArray(x.factIds),
    )
  )
    throw new Error("Phản hồi không khớp phiên nhu cầu.");
  return data;
}
