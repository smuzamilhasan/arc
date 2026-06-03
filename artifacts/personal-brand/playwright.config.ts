import { defineConfig, devices } from "@playwright/test";

// The app is served through the shared Replit proxy at localhost:80
// (web at "/", api-server at "/api"). Override with E2E_BASE_URL if needed.
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:80";

// On Replit the bundled Playwright browser can't resolve its system libs, so
// prefer the Replit-provided chromium when present.
const chromiumExecutable = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global.setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumExecutable
          ? { launchOptions: { executablePath: chromiumExecutable } }
          : {}),
      },
    },
  ],
});
