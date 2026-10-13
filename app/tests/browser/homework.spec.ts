import { expect, newStudent, test } from "./fixtures";
import { makeQuiz, noSideways, signUp, uniq } from "./helpers";

test("homework: a student locks in an answer and finishes", async ({ page, browser }) => {
  await signUp(page);
  await makeQuiz(page, `Homework ${uniq()}`);

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("radio", { name: "Homework" }).check();
  await page.getByRole("button", { name: "Assign" }).click();
  const code = (await page.getByLabel(/^Game code/).textContent())!.trim();
  await expect(page.getByText(/^Due /)).toBeVisible();

  const { ctx: student, page: kid } = await newStudent(browser, test.info());
  await kid.goto("/");
  await kid.getByLabel("Game code").fill(code);
  await kid.getByLabel("Your name").fill("Sam");
  await kid.getByRole("button", { name: "Join" }).click();

  await expect(kid.getByRole("heading", { name: "2+2?" })).toBeVisible();
  await noSideways(kid);
  const lock = kid.getByRole("button", { name: "Lock in answer" });
  await expect(lock).toBeDisabled();
  await kid.getByRole("button", { name: "3", exact: true }).click();
  await kid.getByRole("button", { name: "4", exact: true }).click(); // a misclick is not final
  await lock.click();
  await expect(kid.getByText("Right", { exact: true })).toBeVisible();
  await expect(kid.getByRole("heading", { name: "You finished!" })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText("Done")).toBeVisible({ timeout: 10_000 });
  await student.close();
});

test("a wrong code says so and does not crash", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Game code").fill("000000");
  await page.getByLabel("Your name").fill("Nobody");
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText("No open game with that code")).toBeVisible();
});
