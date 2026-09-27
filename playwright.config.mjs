// Browser checks of the main pages (tests/e2e), against the built site (vite preview).
// Locally they use the installed Microsoft Edge; CI installs Playwright's Chromium.
//   npm run build && npm run test:e2e
import { defineConfig, devices } from "@playwright/test";

const ci = !!process.env.CI;
const browser = ci ? {} : { channel: "msedge" };

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: ci ? 1 : 0,
  reporter: ci ? [["list"], ["github"]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", testIgnore: /phone/, use: { ...browser, viewport: { width: 1400, height: 900 } } },
    { name: "phone", testMatch: /phone/, use: { ...devices["Pixel 7"], ...browser } },
  ],
  webServer: { command: "npm run preview -- --port 4173 --strictPort", port: 4173, reuseExistingServer: !ci, timeout: 60_000 },
});
