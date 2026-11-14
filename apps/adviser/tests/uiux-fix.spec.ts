import { test, expect } from "@playwright/test";
import { persistedFixture, corruptions } from "./fixtures/persisted-state";

for (const [name, corrupt] of Object.entries(corruptions)) {
  test(`UIUX-F01 browser safe recovery: ${name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const state = persistedFixture();
    corrupt(state);
    const raw = JSON.stringify(state);
    await page.addInitScript((value) => {
      if (!localStorage.getItem("lua-adviser-v1"))
        localStorage.setItem("lua-adviser-v1", value);
    }, raw);
    await page.goto("/");
    await expect(
      page.getByText("Cần khôi phục dữ liệu", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Xuất bản gốc", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
    await page.getByRole("button", { name: "Tối", exact: true }).click();
    expect(
      await page.evaluate(() => localStorage.getItem("lua-adviser-v1")),
    ).toBe(raw);
    await page.reload();
    await expect(
      page.getByText("Cần khôi phục dữ liệu", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    await page
      .getByRole("button", { name: "Xác nhận đặt lại dữ liệu", exact: true })
      .click();
    await page.getByRole("button", { name: "Hủy", exact: true }).click();
    expect(
      await page.evaluate(() => localStorage.getItem("lua-adviser-v1")),
    ).toBe(raw);
    await page
      .getByRole("button", { name: "Xác nhận đặt lại dữ liệu", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Xác nhận xóa", exact: true })
      .click();
    await expect(
      page.getByText("Cần khôi phục dữ liệu", { exact: true }),
    ).toHaveCount(0);
  });
}

for (const [name, basis, priceBasis, same, expected] of [
  ["complete versus listing", "complete", "listing", false, false],
  ["unknown baseline basis", "unknown", "listing", false, false],
  ["complete compatible positive control", "complete", "complete", false, true],
  ["same-offer signed delta", "complete", "complete", true, false],
  [
    "stale compatible price stays neutral",
    "complete",
    "complete",
    false,
    false,
  ],
] as const) {
  test(`UIUX-F02 browser: ${name}`, async ({ page }) => {
    const state = persistedFixture();
    state.cartData.candidates[0].baselinePriceBasis = basis;
    if (same) state.cartData.candidates[0].savedOfferId = state.offers[0].id;
    state.offers[0].priceBasis = priceBasis;
    state.observations[0].fetchedAt = new Date().toISOString();
    if (name === "stale compatible price stays neutral")
      state.observations[0].fetchedAt = new Date(
        Date.now() - 25 * 60 * 60 * 1000,
      ).toISOString();
    await page.addInitScript(
      (value) => localStorage.setItem("lua-adviser-v1", JSON.stringify(value)),
      state,
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Giỏ hàng", exact: true }).click();
    await page
      .getByRole("button", { name: "Xem cấu hình", exact: true })
      .click();
    await expect(page.getByText("Ưu đãi tốt hơn", { exact: true })).toHaveCount(
      expected ? 1 : 0,
    );
    if (same) await expect(page.getByText(/-10.*-10\.0%/)).toBeVisible();
  });
}

test("UIUX-F01 deleting an imported cart removes dependent references and survives restart", async ({
  page,
}) => {
  const state = persistedFixture();
  const candidate = state.cartData.candidates[0];
  state.saved = [
    {
      id: "legacy",
      at: candidate.savedAt,
      variants: [candidate.decisionSnapshot.variant],
      profile: null,
      catalogVersion: "fixture",
    },
  ];
  state.cartData.legacyMap = { legacy: [candidate.id] };
  state.legacyRaw = "synthetic legacy backup";
  await page.addInitScript((value) => {
    if (!localStorage.getItem("lua-adviser-v1"))
      localStorage.setItem("lua-adviser-v1", JSON.stringify(value));
  }, state);
  await page.goto("/");
  await page.getByRole("button", { name: "Giỏ hàng", exact: true }).click();
  await page.getByRole("button", { name: "Xóa giỏ", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận xóa", exact: true }).click();
  await expect(
    page.getByText("Chưa có giỏ hàng", { exact: true }),
  ).toBeVisible();
  const next = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lua-adviser-v1")!),
  );
  expect(next.cartData).toEqual({ carts: [], candidates: [], legacyMap: {} });
  expect(next.saved).toEqual([]);
  expect(next.trackingRules).toEqual([]);
  expect(next.alertDeliveries).toEqual([]);
  expect(next.legacyRaw).toBeUndefined();
  await page.reload();
  await expect(
    page.getByText("Cần khôi phục dữ liệu", { exact: true }),
  ).toHaveCount(0);
});
