import { expect, test } from "@playwright/test";

// No API key is configured in e2e: the strategist must work fully in planner mode.
test("planner mode, privacy controls and calendar suggestions work without AI", async ({ page }) => {
  await page.goto("/strategist");
  await expect(page.getByRole("heading", { name: "Your plan, without AI" })).toBeVisible();
  await expect(page.getByText("No Claude API key configured")).toBeVisible();
  await expect(page.getByText("Today's plan")).toBeVisible();
  await expect(page.getByText("Last 7 days")).toBeVisible();

  const finances = page.getByRole("switch", { name: "Share Finances" });
  await expect(finances).toHaveAttribute("aria-checked", "false");
  await finances.click();
  await expect(finances).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Share Finances" })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "test-results/strategist.png" });

  // Calendar export -> suggested quests the user picks.
  await page.getByRole("link", { name: "Quest Board" }).click();
  await page.getByRole("button", { name: "From calendar" }).click();
  const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:e2e-1", "DTSTART;VALUE=DATE:20261028", "SUMMARY:Car service", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  await page.locator('input[type="file"]').setInputFiles({ name: "calendar.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
  await expect(page.getByRole("dialog").getByText("Car service")).toBeVisible();
  await page.getByRole("button", { name: "Add 1 as quest" }).click();
  await expect(page.getByText("1 quest added from your calendar")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Car service From your calendar" })).toBeVisible();
});
