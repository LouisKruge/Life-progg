import { expect, test } from "@playwright/test";

// One serial journey against a fresh database: the first-usable-release flow end to end.
test.describe.configure({ mode: "serial" });

test("onboard, complete a quest, earn XP and credits, and keep it after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make progress visible." })).toBeVisible();
  await page.getByRole("button", { name: "Begin" }).click();

  await page.getByLabel("Display name").fill("Louis");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Wealth/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Current savings (R)").fill("6 000");
  await page.getByLabel("Monthly savings goal (R)").fill("5000");
  await page.getByLabel("First savings milestone (R)").fill("20 000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip" }).click(); // rhythm
  await page.getByRole("button", { name: "Skip" }).click(); // rewards
  await page.getByRole("button", { name: "Skip" }).click(); // AI
  await page.getByLabel("Load demo data").click();
  await page.getByRole("button", { name: "Enter LEVEL ONE" }).click();

  await expect(page.getByRole("heading", { name: /Louis\./ })).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-start.png", fullPage: true });

  // Savings reflect the real onboarding numbers.
  await expect(page.getByText(/of R\s?20[\s,]000/)).toBeVisible();

  // Create a custom quest through the quick-add dialog.
  await page.getByRole("button", { name: "Quick add quest" }).click();
  await page.getByLabel("Title").fill("Deep work block");
  await page.getByLabel("XP reward").fill("150");
  await page.getByLabel("Credit reward").fill("15");
  await page.getByRole("button", { name: "Create quest" }).click();
  await expect(page.getByRole("button", { name: "Complete Deep work block" })).toBeVisible();

  // Complete it; double-clicking must not pay twice.
  await page.getByRole("button", { name: "Complete Deep work block" }).dblclick();
  await expect(page.getByRole("button", { name: "Undo Deep work block" })).toBeVisible();
  await expect(page.getByRole("banner").getByText("15", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-after.png", fullPage: true });

  // Persisted across a full reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "Undo Deep work block" })).toBeVisible();
  await expect(page.getByRole("banner").getByText("15", { exact: true })).toBeVisible();

  // Character history shows the payout.
  await page.getByRole("link", { name: "Character" }).click();
  await expect(page.getByText("XP & credit history")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Deep work block" }).filter({ hasText: "+150 XP" })).toBeVisible();
  await page.screenshot({ path: "test-results/character.png", fullPage: true });

  // Command palette opens with Ctrl+K.
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder("Type a command or search...")).toBeVisible();
  await page.keyboard.type("quest board");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Quest Board" })).toBeVisible();
  await page.screenshot({ path: "test-results/quest-board.png", fullPage: true });

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Back up now" }).click();
  await expect(page.getByText("Backup created")).toBeVisible();
  await page.screenshot({ path: "test-results/settings.png", fullPage: true });
});
