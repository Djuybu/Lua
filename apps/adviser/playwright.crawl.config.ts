import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "crawl-control.spec.ts",
  use: { baseURL: "http://127.0.0.1:4186", browserName: "chromium", channel: "chromium" },
  webServer: {
    command: "python -m http.server 4186 --bind 127.0.0.1 --directory dist-crawl-control",
    url: "http://127.0.0.1:4186",
    reuseExistingServer: false,
  },
  reporter: "list",
});
