import { test as base, expect, type Browser, type TestInfo } from "@playwright/test";

// PW_CDP=http://localhost:9333 drives an already running Chrome over the DevTools protocol, for machines
// where Playwright's own browser can't be downloaded. Without it, Playwright launches its own Chromium.
export const test = base.extend<object, { browser: Browser }>({
  browser: [
    async ({ playwright }, use) => {
      const cdp = process.env.PW_CDP;
      const b = cdp ? await playwright.chromium.connectOverCDP(cdp) : await playwright.chromium.launch();
      await use(b);
      await b.close();
    },
    { scope: "worker" },
  ],
});

export { expect };

// a second person on a second device: own cookies, same screen size as the project
export async function newStudent(browser: Browser, info: TestInfo) {
  const u = info.project.use;
  const ctx = await browser.newContext({
    baseURL: u.baseURL, viewport: u.viewport ?? undefined, isMobile: u.isMobile, hasTouch: u.hasTouch,
  });
  return { ctx, page: await ctx.newPage() };
}
