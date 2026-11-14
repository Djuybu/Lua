import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: "chromium",
  },
  webServer: [
    {
      command: "python -m http.server 4173 --bind 127.0.0.1 --directory dist",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
    },
    {
      command:
        "python -m http.server 4174 --bind 127.0.0.1 --directory dist-chat-fixture",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
