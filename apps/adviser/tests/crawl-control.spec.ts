import { test, expect } from "@playwright/test";
import manifest from "../src/catalog.json";

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`large catalog and explicit crawl controls at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const actions: string[] = [];
    const progress = {
      state: "paused", running: false, updatedAt: "2026-11-14T11:09:00Z", error: null,
      batch: { claimedPages: 0, maxPages: 50 },
      totals: [{ kind: "product", state: "done", tasks: 1000 }, { kind: "product", state: "pending", tasks: 100 }],
    };
    await page.route("**/advisor/v1/catalog**", route => route.fulfill({ json: {
      ...manifest,
      catalogVersion: "large-catalog-regression-test",
      variants: Array.from({ length: 1800 }, (_, i) => ({ ...manifest.variants[0], variantId: `synthetic-ui:${i}`, modelName: `Synthetic UI laptop ${String(i).padStart(4,"0")}` })),
    } }));
    await page.route("**/health", route => route.fulfill({ json: { status: "ok", capabilities: { priceTracking: false } } }));
    await page.route("**/advisor/v1/crawl", async route => {
      if (route.request().method() === "POST") {
        const { action } = route.request().postDataJSON();
        actions.push(action);
        progress.running = action === "resume";
        progress.state = action === "resume" ? "running" : "paused";
      }
      await route.fulfill({ json: progress });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Xem cấu hình", exact: true })).toHaveCount(24);
    expect(actions).toEqual([]);
    await page.getByRole("button", { name: "Trang sau", exact: true }).click();
    await expect(page.getByText("Synthetic UI laptop 0024", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Xem cấu hình", exact: true })).toHaveCount(24);
    await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cập nhật thêm 50 trang", exact: true })).toBeEnabled();
    await expect(page.getByText("1000 URL đã xong · 100 URL còn chờ", { exact: true })).toBeVisible();
    expect(actions).toEqual([]);
    const panel = page.getByRole("heading", { name: "Cập nhật dữ liệu", exact: true });
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `verification/crawl-control-${viewport.width}.png` });
    await page.getByRole("button", { name: "Cập nhật thêm 50 trang", exact: true }).click();
    await expect(page.getByRole("button", { name: "Tạm dừng và lưu", exact: true })).toBeEnabled();
    expect(actions).toEqual(["resume"]);
    await page.getByRole("button", { name: "Tạm dừng và lưu", exact: true }).click();
    await expect(page.getByText("Đã lưu tiến trình", { exact: true })).toBeVisible();
    expect(actions).toEqual(["resume", "pause"]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
}
