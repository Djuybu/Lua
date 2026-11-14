import { test, expect } from "@playwright/test";
import seed from "../src/catalog.json";
test("AC-MIGRATE browser: v1 snapshots migrate once and retain recovery data", async ({
  page,
}) => {
  const legacy = {
    version: 1,
    preferences: {
      appearance: "light",
      seed: "#6750A4",
      dynamic: false,
      endpoint: "",
    },
    confirmed: null,
    revision: 0,
    saved: [
      {
        id: "legacy-browser",
        at: "2026-11-10T10:00:00Z",
        variants: seed.variants.slice(0, 1),
        profile: null,
        catalogVersion: "historical-v1",
        decisionNote: "Original decision",
      },
    ],
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem("lua-adviser-v1"))
      localStorage.setItem("lua-adviser-v1", JSON.stringify(data));
  }, legacy);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await page.getByRole("button", { name: "Giỏ hàng", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Quyết định đã nhập", exact: true }),
  ).toBeVisible();
  const migrated = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lua-adviser-v1")!),
  );
  expect(migrated.version).toBe(2);
  expect(migrated.cartData.candidates).toHaveLength(1);
  expect(migrated.cartData.candidates[0].decisionSnapshot.variant).toEqual(
    legacy.saved[0].variants[0],
  );
  expect(migrated.cartData.candidates[0].baselineAmount).toBeNull();
  expect(migrated.legacyRaw).toBe(JSON.stringify(legacy));
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Trang chủ", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lua-adviser-v1")!).cartData.candidates
          .length,
    ),
  ).toBe(1);
});
test("acceptance journey: four destinations, floating search, filters, needs, carts and palette", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Trang chủ", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Giỏ hàng", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Khám phá", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Tìm thiết bị cho tôi", exact: true })
    .click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  for (const label of [
    "Học tập & văn phòng",
    "Lập trình",
    "Thiết kế & dựng phim",
  ])
    await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByLabel("Trần ngân sách VND").fill("0");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(
    page.getByText("Ngân sách phải là số nguyên VND lớn hơn 0."),
  ).toBeVisible();
  await page.getByLabel("Trần ngân sách VND").fill("25000000");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  for (const label of ["Tiết kiệm ngân sách", "Hiệu năng xử lý", "Đồ họa"])
    await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page
    .getByRole("button", { name: "Xác nhận nhu cầu", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Điều chỉnh nhu cầu", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Tìm thiết bị", { exact: true }).fill("no-match-xyz");
  await expect(
    page.getByText("Không có cấu hình khớp bộ lọc.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Tìm thiết bị", { exact: true }).fill("");
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await page.getByRole("button", { name: "32 GB", exact: true }).click();
  await page.getByRole("button", { name: "Áp dụng · 0", exact: true }).click();
  await expect(
    page.getByText("Không có cấu hình khớp bộ lọc.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await page
    .getByRole("button", { name: "Xem cấu hình", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Tổng quan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Thông số", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Vi xử lý & Đồ họa", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Thêm vào giỏ", exact: true }).click();
  await page.getByLabel("Tên giỏ", { exact: true }).fill("Laptop đi làm");
  await page.getByLabel("Ghi chú", { exact: true }).fill("Giữ lý do gốc");
  await page
    .getByRole("button", { name: "Thêm vào giỏ", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Giỏ hàng", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Laptop đi làm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Theo dõi giá", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Xem cấu hình", exact: true }).click();
  await expect(page.getByText("Giá khi lưu: Chưa xác định")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Giỏ hàng", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Laptop đi làm", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa giỏ", exact: true }).click();
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Laptop đi làm", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await expect(page.getByLabel("Địa chỉ máy chủ")).toHaveCount(0);
  await page.getByLabel("Mã màu tùy chỉnh").fill("#984061");
  await page
    .getByRole("button", { name: "Áp dụng màu tùy chỉnh", exact: true })
    .click();
  await page.getByRole("button", { name: "Tối", exact: true }).click();
  await page.screenshot({
    path: "verification/acceptance-compact-settings.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Carts", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Custom color hex")).toHaveValue("#984061");
  await expect(
    page.getByRole("button", { name: "Dark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Tiếng Việt", exact: true }).click();
  await page.getByRole("button", { name: "Sáng", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Trang chủ", exact: true }).click();
  await page.screenshot({
    path: "verification/acceptance-expanded-catalog.png",
    fullPage: true,
  });
});
