import { expect, newStudent, test } from "./fixtures";
import { noSideways, signUp, uniq } from "./helpers";

// A long title and long answers are what break phone layouts.
const LONG = `A quiz with a very long title so we can see how it wraps on a small phone screen ${uniq()}`;

test("long titles and long answers do not push the page sideways", async ({ page }) => {
  await signUp(page);
  await page.goto("/quizzes/edit/");
  await page.getByLabel("Title", { exact: true }).fill(LONG);
  await page.getByLabel("Question", { exact: true }).fill("What is the capital of France, the country in western Europe known for the Eiffel Tower?");
  await page.getByLabel("Answer 1", { exact: true }).fill("Paris, which is a rather long answer label that needs to wrap onto several lines");
  await page.getByLabel("Answer 2", { exact: true }).fill("Lyon");
  await page.getByLabel("Answer 1 is correct").check();
  await noSideways(page); // editor
  await page.getByRole("button", { name: "Save quiz" }).click();

  await expect(page.getByRole("heading", { name: "My quizzes" })).toBeVisible();
  await noSideways(page); // dashboard
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Shuffle the question order")).toBeVisible();
  await noSideways(page); // rules panel open

  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.getByText("0 joined")).toBeVisible();
  await noSideways(page); // host lobby

  for (const path of ["/assignments/", "/account/", "/privacy/", "/terms/", "/login/", "/signup/", "/"]) {
    await page.goto(path);
    await noSideways(page);
  }
});

test("everything you tap is big enough", async ({ page }) => {
  await signUp(page);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a[href]")]
      .map((e) => ({ t: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24), r: e.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.height < 32)
      .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`));
  expect(small, "tap targets under 32px tall").toEqual([]);
});
