import { expect, test } from "@playwright/test";

// Runs after core-loop.spec.ts against the same database (demo data loaded, 15 credits earned).
test("earn credits, redeem a real-life reward, confirm it, and keep it after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Undo Deep work block" })).toBeVisible();
  // Complete the six demo quests (+37 credits). One of them crosses level 2.
  const pending = page.getByRole("button", { name: /^Complete / });
  for (let i = 0; i < 6; i++) {
    await expect(pending).toHaveCount(6 - i);
    await pending.first().click();
    await expect(pending).toHaveCount(5 - i);
    const levelUp = page.getByRole("alertdialog", { name: /Level up/ });
    if (await levelUp.isVisible()) {
      await expect(levelUp).toContainText("2");
      await page.keyboard.press("Escape");
      await expect(levelUp).toBeHidden();
    }
  }

  await page.getByRole("link", { name: "Rewards Vault" }).click();
  await expect(page.getByRole("heading", { name: "Real-life rewards" })).toBeVisible();
  const wallet = page.locator("text=Credit wallet").locator("..").locator("..");
  await expect(wallet).toContainText("52");

  // Rewards out of reach explain why; the free one is redeemable.
  await expect(page.getByRole("button", { name: "8 more credits needed", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Redeem" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Redeem “Gaming evening”?");
  await expect(page.getByRole("dialog")).toContainText("52 → 12");
  await page.getByRole("button", { name: "Redeem for 40 credits" }).click();
  await expect(page.getByRole("dialog")).toContainText("Enjoy it.");
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(wallet).toContainText("12");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Real-life rewards" })).toBeVisible();
  await expect(wallet).toContainText("12");
  await page.getByRole("tab", { name: "history" }).click();
  await expect(page.getByText("Awaiting confirmation")).toBeVisible();
  await page.getByRole("button", { name: "It happened" }).click();
  await page.getByRole("button", { name: "Confirm spending" }).click();
  await expect(page.getByText(/Enjoyed/)).toBeVisible();
  await page.screenshot({ path: "test-results/vault.png" });

  await page.getByRole("link", { name: "Wealth Center" }).click();
  await expect(page.getByRole("heading", { name: "Money, made visible" })).toBeVisible();
  await expect(page.getByText("First milestone")).toBeVisible();
  await page.screenshot({ path: "test-results/wealth.png" });
});
