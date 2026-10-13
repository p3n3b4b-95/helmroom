import { expect, newStudent, test } from "./fixtures";
import { makeQuiz, noSideways, signUp, uniq } from "./helpers";

test("a teacher runs a live game and a student plays it", async ({ page, browser }) => {
  await signUp(page);
  await makeQuiz(page, `Live ${uniq()}`);

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.getByText("0 joined")).toBeVisible();
  const code = (await page.getByLabel(/^Game code/).textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);
  await noSideways(page);

  // the student is another person on another phone: their own browser context
  const { ctx: student, page: kid } = await newStudent(browser, test.info());
  await kid.goto("/");
  await kid.getByLabel("Game code").fill(code);
  await kid.getByLabel("Your name").fill("Rina");
  await kid.getByRole("button", { name: "Join" }).click();
  await expect(kid.getByText("Your teacher will start the game soon.")).toBeVisible();
  await noSideways(kid);

  await expect(page.getByText("1 joined")).toBeVisible();
  await page.getByRole("button", { name: "Start the game" }).click();

  await expect(kid.getByRole("heading", { name: "2+2?" })).toBeVisible();
  await noSideways(kid);
  await kid.getByRole("button", { name: "4", exact: true }).click();
  await expect(kid.getByText("Answer saved. You can change it until the question ends.")).toBeVisible();
  // no hint of right or wrong while the answer can still change
  await expect(kid.getByText("Right", { exact: true })).toHaveCount(0);

  // change of mind: tap another answer, the last one counts
  await kid.getByRole("button", { name: "3", exact: true }).click();
  await expect(kid.getByRole("button", { name: "3", exact: true })).toHaveAttribute("aria-pressed", "true");
  await kid.getByRole("button", { name: "4", exact: true }).click();

  await expect(page.getByText("1 of 1 answered")).toBeVisible();
  await noSideways(page);
  await page.getByRole("button", { name: "Finish game" }).click();
  await expect(page.getByText("That's the game")).toBeVisible();

  await expect(kid.getByRole("heading", { name: "Game over" })).toBeVisible();
  await expect(kid.getByText(/\d+ points/).first()).toBeVisible();

  await page.getByRole("link", { name: "See full results" }).click();
  await expect(page.getByRole("cell", { name: "Rina" })).toBeVisible();
  await noSideways(page);
  await student.close();
});
