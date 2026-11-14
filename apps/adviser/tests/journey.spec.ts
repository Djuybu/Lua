import { test, expect } from "@playwright/test";
test("guest discovery, ordered needs, cancellation, compare and palette persistence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Thiết bị phù hợp,")).toBeVisible();
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
  await expect(page.getByText("Laptop · trần")).toBeVisible();
  await page.getByRole("button", { name: "Nhu cầu", exact: true }).click();
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(page.getByText("Laptop · trần")).toBeVisible();
  await page.getByRole("button", { name: "Khám phá", exact: true }).click();
  await page
    .getByLabel("Tìm theo tên, RAM hoặc dung lượng")
    .fill("no-match-xyz");
  await expect(
    page.getByText("Chưa có cấu hình trong bộ lọc này"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await page
    .getByRole("button", { name: "So sánh", exact: true })
    .nth(1)
    .click();
  await page
    .getByRole("button", { name: "Xem chi tiết", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Lưu quyết định", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu quyết định trên thiết bị.").last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await page.getByLabel("Mã màu tùy chỉnh").fill("#984061");
  await page
    .getByRole("button", { name: "Áp dụng màu tùy chỉnh", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await expect(page.getByLabel("Mã màu tùy chỉnh")).toHaveValue("#984061");
  await page.getByRole("button", { name: "Đã lưu", exact: true }).click();
  await page.getByRole("button", { name: "Xóa bản lưu", exact: true }).click();
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Xóa bản lưu", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa bản lưu", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận xóa", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Đã lưu", exact: true }).click();
  await expect(page.getByText("Chưa có quyết định nào")).toBeVisible();
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await page.screenshot({
    path: "verification/compact-settings.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Tối", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tối", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "verification/compact-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sáng", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Khám phá", exact: true }).click();
  await page.screenshot({
    path: "verification/expanded-catalog.png",
    fullPage: true,
  });
});
