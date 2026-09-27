// Phone layout: the bottom bar replaces the sidebar, and More lists every page.
import { test, expect } from "@playwright/test";

test("the bottom bar and its More sheet navigate between pages", async ({ page }) => {
  await page.goto("/#runewords");
  const bar = page.locator(".mobile-bar");
  await expect(bar).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  await bar.getByRole("button", { name: /More/ }).click();
  await page.locator(".mobile-sheet").getByRole("button", { name: /^Sets/ }).click();
  await expect(page).toHaveURL(/#sets/);
  // A page that isn't on the bar takes the fifth button's place.
  await expect(bar.locator("button.selected")).toContainText("Sets");
});
