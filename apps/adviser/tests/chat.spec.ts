import { test, expect } from "@playwright/test";
test("CHAT-U01 production unavailable: labelled input, keyboard focus and disabled send", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tư vấn AI", exact: true }).click();
  await expect(
    page.getByText("Chatbot chưa khả dụng", { exact: true }),
  ).toBeVisible();
  const field = page.getByLabel("Tin nhắn tư vấn", { exact: true });
  await field.fill("Tôi cần laptop");
  await field.focus();
  await expect(field).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Gửi tin nhắn", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Tư vấn AI", exact: true }).click();
  await expect(page.getByLabel("Tin nhắn tư vấn", { exact: true })).toHaveValue(
    "",
  );
});
test("CHAT-U02 injected fixture: sending/cancel/late/error/retry/fallback and focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:4174");
  await page.getByRole("button", { name: "Tư vấn AI", exact: true }).click();
  const field = page.getByLabel("Tin nhắn tư vấn", { exact: true });
  await field.fill("slow");
  await page.getByRole("button", { name: "Gửi tin nhắn", exact: true }).click();
  await expect(page.getByText("Đang chờ phản hồi…")).toBeVisible();
  await page.getByRole("button", { name: "Hủy gửi", exact: true }).click();
  await expect(field).toBeFocused();
  await expect(
    page.getByText("Phản hồi dự phòng", { exact: true }),
  ).toHaveCount(0);
  await field.fill("error");
  await page.getByRole("button", { name: "Gửi tin nhắn", exact: true }).click();
  await page.getByRole("button", { name: "Thử gửi lại", exact: true }).click();
  await expect(
    page.getByText(/Fixture transport — không phải HTTP hoặc AI live/),
  ).toBeVisible();
  await expect(
    page.getByText("Phản hồi dự phòng", { exact: true }),
  ).toBeVisible();
  await expect(field).toBeFocused();
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  await page.getByRole("button", { name: "Giỏ hàng", exact: true }).click();
  await page.getByRole("button", { name: "Tư vấn AI", exact: true }).click();
  await expect(
    page.getByText("Phản hồi dự phòng", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "verification/chat-fixture-fallback.png",
    fullPage: true,
  });
});
test("CHAT-U03 proposal cancel/write failure/durable confirm and session-only history", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4174");
  await page.getByRole("button", { name: "Tư vấn AI", exact: true }).click();
  const send = async () => {
    await page.getByLabel("Tin nhắn tư vấn", { exact: true }).fill("proposal");
    await page
      .getByRole("button", { name: "Gửi tin nhắn", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Xem lại đề xuất nhu cầu", exact: true })
      .click();
  };
  await send();
  await page.getByRole("button", { name: "Hủy đề xuất", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Điều chỉnh nhu cầu", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("lua-adviser-v1")))
    .toBeNull();
  await send();
  await page.evaluate(() => {
    (window as any).originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw Error("fixture disk failure");
    };
  });
  await page
    .getByRole("button", { name: "Xác nhận đề xuất", exact: true })
    .click();
  await expect(page.getByText(/Không thể xác nhận đề xuất/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Điều chỉnh nhu cầu", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("lua-adviser-v1")))
    .toBeNull();
  await page.evaluate(() => {
    Storage.prototype.setItem = (window as any).originalSet;
  });
  await page
    .getByRole("button", { name: "Xác nhận đề xuất", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Điều chỉnh nhu cầu", exact: true }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Điều chỉnh nhu cầu", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Phản hồi dự phòng", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "verification/chat-confirmed.png",
    fullPage: true,
  });
});
