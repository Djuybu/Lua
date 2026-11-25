import type { SnapshotManifest } from "../catalog";
import type { StagedCrawlerOffer } from "../crawler";
export const sourceLabels: Record<string, string> = {
  laptopaz: "LaptopAZ",
  cellphones: "CellphoneS",
  dienmayxanh: "Điện Máy Xanh",
  fptshop: "FPT Shop",
  tgdd: "Thế Giới Di Động",
  thegioididong: "Thế Giới Di Động",
  shopdunk: "ShopDunk",
  trungtran: "Trung Trần",
  oneway: "Oneway",
};
export function sourceLabel(sourceId: string) {
  if (!sourceId) return "";
  return sourceLabels[sourceId.toLowerCase()] ?? sourceId;
}
/** Payable total: listed price plus known mandatory fees and shipping. */
export function offerTotal(offer: StagedCrawlerOffer): number | null {
  if (offer.mandatoryFeesVnd === null || offer.shippingVnd === null)
    return null;
  const total = offer.basePriceVnd + offer.mandatoryFeesVnd + offer.shippingVnd;
  return Number.isSafeInteger(total) ? total : null;
}
/** Lowest-priced in-stock official offer for a variant. */
export function officialOffer(
  manifest: Pick<SnapshotManifest, "offers">,
  variantId: string,
): StagedCrawlerOffer | null {
  return (
    manifest.offers
      .filter(
        (offer) =>
          offer.matchedVariantId === variantId &&
          offer.stockStatus === "IN_STOCK" &&
          offer.completenessStatus === "COMPLETE" &&
          offerTotal(offer) !== null,
      )
      .sort(
        (a, b) =>
          offerTotal(a)! - offerTotal(b)! ||
          Date.parse(b.observedAt) - Date.parse(a.observedAt),
      )[0] ?? null
  );
}
export function aiFallbackCopy(reason: string | null | undefined) {
  if (!reason) return "";
  if (reason === "AI_MOCK" || reason === "AI_DISABLED")
    return "Mô hình AI đang tắt; câu trả lời được tổng hợp trực tiếp từ dữ liệu chính thức.";
  if (reason === "AI_LOCAL_LIMIT")
    return "Đã đạt giới hạn lượt gọi AI; câu trả lời được tổng hợp từ dữ liệu chính thức.";
  return "AI tạm thời không phản hồi; câu trả lời lấy từ dữ liệu chính thức.";
}
