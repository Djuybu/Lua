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

export async function fetchCatalog(endpoint: string, query: string, signal: AbortSignal) {
  const res = await fetch(endpoint.replace(/\/$/, "") + "/advisor/v1/catalog?q=" + encodeURIComponent(query), { signal });
  if (!res.ok) throw Error("CATALOG_UNAVAILABLE");
  const data = await res.json();
  if (typeof data.catalogVersion !== "string" || !Array.isArray(data.variants) ||
      !data.variants.every((v: any) => v && typeof v.variantId === "string" && typeof v.modelName === "string" && v.specifications && Number.isSafeInteger(v.specifications.ramGb) && Number.isSafeInteger(v.specifications.storageGb) && Array.isArray(v.factIds))) throw Error("INVALID_CATALOG");
  return data as import("./catalog").SnapshotManifest;
}
export const liveChatTransport: import("./chat").ChatTransport = async (input, signal) => {
  const { DEFAULT_API_ENDPOINT } = await import("./api/config");
  const res = await fetch(DEFAULT_API_ENDPOINT + "/advisor/v1/chat", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ ...input, history: input.history.slice(-10).map(x => ({role:x.role,text:x.text})) }),
  });
  if (!res.ok) throw Error("CHAT_UNAVAILABLE");
  return res.json();
};
