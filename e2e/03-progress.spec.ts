import { expect, test } from "@playwright/test";

// Runs after 02-rewards.spec.ts: quests were completed and a reward redeemed, so unlocks exist.
test("achievements, skill trees, a season and the timeline reflect real progress", async ({ page }) => {
  await page.goto("/achievements");
  await expect(page.getByRole("heading", { name: /of \d+ unlocked/ })).toBeVisible();
  const firstStep = page.locator("div").filter({ has: page.getByText("First Step", { exact: true }) }).filter({ hasText: "Unlocked" }).first();
  await expect(firstStep).toBeVisible();
  await expect(page.locator("div").filter({ has: page.getByText("Enjoyment Counts", { exact: true }) }).filter({ hasText: "Unlocked" }).first()).toBeVisible();

  // Manual achievement with evidence.
  await page.getByRole("button", { name: "It happened: New Strength Record" }).click();
  await page.getByLabel("Evidence or note (optional)").fill("Squat 120 kg");
  await page.getByRole("button", { name: "Unlock achievement" }).click();
  await expect(page.getByText("“Squat 120 kg”")).toBeVisible();

  await page.getByRole("link", { name: "Skill Trees" }).click();
  await page.getByRole("tab", { name: /Discipline/ }).click();
  await expect(page.getByRole("button", { name: "First Step Unlocked" })).toBeVisible();
  await page.getByRole("tab", { name: /Wealth/ }).click();
  await page.getByRole("button", { name: /^Saver/ }).click();
  await expect(page.getByText("Unlock condition")).toBeVisible();
  await page.screenshot({ path: "test-results/skills-graph.png" });
  await page.getByRole("tab", { name: /Discipline/ }).click();
  await page.getByRole("tab", { name: "List" }).click();
  await expect(page.getByText("Week Streak available")).toBeVisible();
  await page.screenshot({ path: "test-results/skills.png" });

  await page.getByRole("link", { name: "Life Seasons" }).click();
  await page.getByRole("button", { name: "New season" }).click();
  await page.getByLabel("Name").fill("Foundation");
  await page.getByLabel("Primary objective 1").fill("Save R20,000");
  await page.getByLabel("Celebration at the end").fill("Weekend away");
  await page.getByRole("button", { name: "Create season" }).click();
  await expect(page.getByRole("heading", { name: "Foundation" })).toBeVisible();
  await expect(page.getByText("Day 1 of 90")).toBeVisible();
  await page.getByLabel("What went well?").fill("Started strong");
  await page.getByRole("button", { name: "Save this week's review" }).click();
  await expect(page.getByText("Went well:")).toBeVisible();
  await page.screenshot({ path: "test-results/season.png" });

  await page.getByRole("link", { name: "Timeline" }).click();
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Title").fill("Started LEVEL ONE properly");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Started LEVEL ONE properly")).toBeVisible();
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  await expect(page.getByText("Achievement unlocked: First Step")).toBeVisible();
  await expect(page.getByText("Started LEVEL ONE properly")).toBeHidden();
  await page.screenshot({ path: "test-results/timeline.png" });

  // Everything persists after a reload.
  await page.reload();
  await page.getByRole("link", { name: "Life Seasons" }).click();
  await expect(page.getByRole("heading", { name: "Foundation" })).toBeVisible();
});
