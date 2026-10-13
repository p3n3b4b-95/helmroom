import { defineConfig } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3100";
// Tests drive a running, built app: `npm run build && npm run start -- -p 3100`, with a database behind it.
// If Playwright's own browser can't be downloaded, point PW_CHROME at any Chrome or Chromium binary.
const executablePath = process.env.PW_CHROME;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL, launchOptions: executablePath ? { executablePath } : {} },
  projects: [
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
