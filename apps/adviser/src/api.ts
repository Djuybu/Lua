import type { RecommendationResponseEnvelope } from "./envelope";
import type { ConfirmedNeedsProfile } from "./model";
import { safeEndpoint } from "./model";
export async function recommend(
  endpoint: string,
  profile: ConfirmedNeedsProfile,
  revision: number,
  requestId: string,
  signal: AbortSignal,
): Promise<RecommendationResponseEnvelope> {
  if (!safeEndpoint(endpoint))
    throw new Error("Dùng HTTPS hoặc địa chỉ máy chủ cục bộ hợp lệ.");
  const res = await fetch(
    endpoint.replace(/\/$/, "") + "/advisor/v1/recommend",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        schemaVersion: "1.0.0",
        ruleVersion: "2026.11",
        catalogVersion: "retail-dev-2026-11-14",
        requestId,
        decisionId: "local-decision",
        profileRevision: revision,
        profile,
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Không thể tải kết quả.");
  if (
    data.schemaVersion !== "1.0.0" ||
    data.ruleVersion !== "2026.11" ||
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
