import type { ConfirmedNeedsProfile, DeviceCategory } from "./taxonomy";
import {
  CATEGORY_PURPOSES,
  VALID_PRIORITIES,
  validateConfirmedProfile,
} from "./taxonomy";
export { CATEGORY_PURPOSES, VALID_PRIORITIES, validateConfirmedProfile };
export type { ConfirmedNeedsProfile, DeviceCategory };
export const categories: Record<DeviceCategory, string> = {
  phone: "Điện thoại",
  tablet: "Máy tính bảng",
  pc_laptop: "Laptop",
  pc_desktop: "PC để bàn",
};
export const labels: Record<string, string> = {
  phone_daily_comms: "Liên lạc hằng ngày",
  phone_photography: "Chụp ảnh",
  phone_gaming_heavy: "Chơi game",
  phone_battery_longevity: "Sử dụng cả ngày",
  phone_compact_mobility: "Gọn nhẹ",
  tablet_drawing_creative: "Vẽ & sáng tạo",
  tablet_study_reading: "Học tập & đọc sách",
  tablet_media_entertainment: "Giải trí",
  tablet_light_office: "Công việc nhẹ",
  tablet_compact_travel: "Mang theo khi đi xa",
  laptop_office_study: "Học tập & văn phòng",
  laptop_software_dev: "Lập trình",
  laptop_graphic_video: "Thiết kế & dựng phim",
  laptop_gaming_aaa: "Chơi game",
  laptop_ultraportable: "Di chuyển thường xuyên",
  desktop_software_dev_vm: "Lập trình & máy ảo",
  desktop_gaming_stream: "Game & livestream",
  desktop_3d_render: "Đồ họa 3D",
  desktop_home_office: "Làm việc tại nhà",
  priority_budget_savings: "Tiết kiệm ngân sách",
  priority_performance_cpu: "Hiệu năng xử lý",
  priority_graphics_gpu: "Đồ họa",
  priority_battery_life: "Thời lượng pin",
  priority_display_quality: "Chất lượng màn hình",
  priority_portability_weight: "Gọn nhẹ",
  priority_build_durability: "Độ bền",
  priority_warranty_support: "Bảo hành",
  priority_upgradeability: "Khả năng nâng cấp",
  priority_quiet_cooling: "Êm & mát",
};
export type Draft = {
  category: DeviceCategory;
  purposes: string[];
  priorities: string[];
  budget: string;
  minRam: string;
  os: string;
};
export const initialDraft: Draft = {
  category: "pc_laptop",
  purposes: [],
  priorities: [],
  budget: "",
  minRam: "",
  os: "",
};
export function profileOf(d: Draft): ConfirmedNeedsProfile {
  const os = d.os.trim();
  return {
    category: d.category,
    orderedPurposes: d.purposes as [string, string, string],
    orderedPriorities: d.priorities as [string, string, string],
    budget: { hardCeilingVnd: /^\d+$/.test(d.budget) ? Number(d.budget) : NaN },
    hardConstraints: {
      ...(d.minRam ? { minRamGb: Number(d.minRam) } : {}),
      ...(os ? { requiredOs: [os] } : {}),
    },
  };
}
export function draftErrors(d: Draft): string[] {
  const e = validateConfirmedProfile(profileOf(d)).errors;
  if (
    d.minRam &&
    (!/^\d+$/.test(d.minRam) ||
      Number(d.minRam) <= 0 ||
      !Number.isSafeInteger(Number(d.minRam)))
  )
    e.push("RAM phải là số nguyên dương.");
  return e;
}
export function toggleOrdered(xs: string[], id: string): string[] {
  return xs.includes(id)
    ? xs.filter((x) => x !== id)
    : xs.length < 3
      ? [...xs, id]
      : xs;
}
export function changeCategory(d: Draft, category: DeviceCategory): Draft {
  if (d.category === category) return d;
  return { ...d, category, purposes: [], os: "", minRam: "" };
}
export function vnd(n: number | null | undefined, fallback = "Chưa xác định") {
  return n == null || !Number.isFinite(n)
    ? fallback
    : new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(n);
}
export function formatObservedAt(
  iso: string | null | undefined,
  locale: "vi" | "en" = "vi",
) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}
function isStrictPrivateIpv4(host: string) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const p = host.split(".").map(Number);
  if (p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  return (
    p[0] === 10 ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
  );
}
export function safeEndpoint(value: string) {
  try {
    const u = new URL(value);
    if (u.username || u.password) return false;
    return (
      u.protocol === "https:" ||
      (u.protocol === "http:" &&
        (["localhost", "127.0.0.1", "10.0.2.2"].includes(u.hostname) ||
          isStrictPrivateIpv4(u.hostname)))
    );
  } catch {
    return false;
  }
}
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function outcome(result: {
  shortlist: unknown[];
  excludedVariants: { reasonCode: string }[];
}) {
  if (result.shortlist.length) return "Kết quả từ dịch vụ tư vấn";
  if (
    result.excludedVariants.some((x) => x.reasonCode === "UNKNOWN_CAPABILITY")
  )
    return "Chưa đủ bằng chứng về độ phù hợp";
  if (
    !result.excludedVariants.length ||
    result.excludedVariants.some((x) => x.reasonCode === "NO_OFFERS")
  )
    return "Chưa có chào bán đủ căn cứ";
  return "Chưa có cấu hình đáp ứng ràng buộc";
}
