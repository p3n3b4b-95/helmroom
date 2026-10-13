import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export async function signUp(page: Page, tag = "t") {
  const email = `${tag}-${uniq()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Test Teacher");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("heading", { name: "My quizzes" })).toBeVisible();
  return email;
}

// One multiple-choice question: "2+2?" with 3, 4, 5 and 4 is right.
export async function makeQuiz(page: Page, title: string) {
  await page.goto("/quizzes/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Question", { exact: true }).fill("2+2?");
  await page.getByLabel("Answer 1", { exact: true }).fill("3");
  await page.getByLabel("Answer 2", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Add answer" }).click();
  await page.getByLabel("Answer 3", { exact: true }).fill("5");
  await page.getByLabel("Answer 2 is correct").check();
  await page.getByRole("button", { name: "Save quiz" }).click();
  await expect(page.getByRole("heading", { name: "My quizzes" })).toBeVisible();
}

export async function noSideways(page: Page) {
  const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  expect(w.s, `page is ${w.s}px wide in a ${w.c}px window`).toBeLessThanOrEqual(w.c);
}
