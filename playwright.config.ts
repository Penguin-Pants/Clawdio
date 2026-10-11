import { defineConfig, devices } from "@playwright/test";

// A local Chromium build can stand in for the Playwright download (PW_CHROMIUM_PATH).
const chromiumPath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1200, height: 800 },
  },
  webServer: {
    command: "npx vite preview -c vite.e2e.config.ts",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1200, height: 800 },
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
      },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1200, height: 800 } },
    },
  ],
});
