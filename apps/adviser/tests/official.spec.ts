import { test, expect } from "@playwright/test";
import { persistedFixture } from "./fixtures/persisted-state";
import {
  profileOf,
  initialDraft,
  CATEGORY_PURPOSES,
  VALID_PRIORITIES,
} from "../src/model";
test("current UI retains Carts and asks the explanation route with confirmed needs", async ({
  page,
}) => {
  const state = persistedFixture();
  state.confirmed = profileOf({
    ...initialDraft,
    budget: "30000000",
    purposes: [...CATEGORY_PURPOSES.pc_laptop.slice(0, 3)],
    priorities: [...VALID_PRIORITIES.slice(0, 3)],
  });
  await page.addInitScript(
    (s) => localStorage.setItem("lua-adviser-v1", JSON.stringify(s)),
    state,
  );
  await page.route("https://example.com/advisor/v1/explain", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.profile).toEqual(state.confirmed);
    expect(body.question).toBe("Giá bao nhiêu?");
    await route.fulfill({
      json: {
        requestId: body.requestId,
        variantId: body.variantId,
        provider: "mock",
        model: null,
        isFallback: true,
        fallbackReason: "AI_MOCK",
        lines: ["Fixture: câu trả lời theo giá chính thức."],
      },
    });
  });
  await page.goto("http://127.0.0.1:4174");
  await expect(
    page.getByRole("button", { name: "Giỏ hàng", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Giá chính thức:/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Xem cấu hình", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tư vấn AI", exact: true })
    .click();
  await page
    .getByLabel("Câu hỏi về cấu hình", { exact: true })
    .fill("Giá bao nhiêu?");
  await page.getByRole("button", { name: "Hỏi AI", exact: true }).click();
  await expect(
    page.getByText("Fixture: câu trả lời theo giá chính thức.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Phản hồi dự phòng/).first()).toBeVisible();
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await page
    .getByRole("button", { name: "Chỉ xử lý AI ngoại tuyến", exact: true })
    .click();
  await page.getByRole("button", { name: "Trang chủ", exact: true }).click();
  await page
    .getByRole("button", { name: "Xem cấu hình", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tư vấn AI", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Hỏi AI", exact: true }),
  ).toBeDisabled();
});
