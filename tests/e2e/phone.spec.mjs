// Phone layout: a top bar with a menu button replaces the sidebar, and the menu lists every page.
import { test, expect } from "@playwright/test";

test("the menu button opens a drawer that navigates between pages", async ({ page }) => {
  await page.goto("/#runewords");
  const top = page.locator(".mobile-top");
  await expect(top).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".mobile-bar")).toHaveCount(0);
  const menu = top.getByRole("button", { name: "Menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Median XL Runetool" });
  await expect(drawer).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await drawer.getByRole("button", { name: /^Sets/ }).click();
  await expect(page).toHaveURL(/#sets/);
  await expect(drawer).toBeHidden();
  // The top bar names the page you're on.
  await expect(top).toContainText("Sets");
  // Esc closes it too.
  await menu.click();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("the drawer has no Help confirm values link", async ({ page }) => {
  await page.goto("/#runewords");
  await page.locator(".mobile-top").getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Median XL Runetool" })).not.toContainText("Help confirm values");
});
