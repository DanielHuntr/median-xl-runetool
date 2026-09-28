// The main pages in a real browser: they load, and their key actions work end to end.
import { test, expect } from "@playwright/test";

test("runeword filters narrow the list", async ({ page }) => {
  await page.goto("/#runewords");
  const count = page.locator(".result-count strong");
  await expect(count).not.toHaveText("0");
  const before = Number(await count.textContent());
  await page.getByRole("main").getByRole("button", { name: /Filters/ }).first().click();
  await page.getByRole("button", { name: /^Weapons/ }).click();
  await page.locator(".filter-group .chips button", { hasText: /^Bows$/ }).click();
  await page.getByRole("button", { name: /^Show \d+ runewords?$/ }).click();
  await expect(page.locator(".pill", { hasText: "Bows" })).toBeVisible();
  expect(Number(await count.textContent())).toBeLessThan(before);
});

test("the cube transmutes two Nef Runes into an Eth Rune", async ({ page }) => {
  await page.goto("/#cube");
  const search = page.locator(".cube-picker input[type=search]");
  await search.fill("nef rune");
  const add = () => page.getByRole("button", { name: /^(Add )?Nef Rune$/ }).filter({ visible: true }).first().click();
  await add();
  // Once one is in, the same item moves to the "More of the same" group.
  await page.getByText("More of the same").click();
  await add();
  await expect(page.locator(".cube-slot")).toHaveCount(2);
  await page.getByRole("button", { name: "Transmute" }).click();
  await expect(page.locator(".cube-result")).toContainText("Eth Rune");
});

test("Show recipe on a tiered unique loads its recipe in the cube", async ({ page }) => {
  await page.goto("/#uniques");
  const card = page.locator(".unique-card", { hasText: "Grim Fang" }).first();
  await card.locator(".cube-link-square").click();
  await expect(page).toHaveURL(/#cube/);
  await expect(page.locator(".cube-link-note")).toContainText("Grim Fang");
  await expect(page.locator(".cube-slot")).toHaveCount(4);
});

test("the theme picker switches the theme", async ({ page }) => {
  await page.goto("/#runewords");
  await page.locator(".theme-trigger").click();
  await page.getByRole("radio", { name: /Hell/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "hell");
});

test("a starter build's levelling guide opens", async ({ page }) => {
  await page.goto("/#builds");
  await page.locator(".guide-btn").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#guide-title")).not.toBeEmpty();
});

test("the character planner loads", async ({ page }) => {
  await page.goto("/#planner");
  await expect(page.getByRole("button", { name: /Suggest gear/ })).toBeVisible();
});

test("a backup downloads and restores", async ({ page }) => {
  await page.goto("/#runewords");
  await page.evaluate(() => localStorage.setItem("mxlrw2:saved-builds", "[]"));
  await page.getByRole("button", { name: "Back up & restore" }).click();
  const dialog = page.getByRole("dialog", { name: "Back up & restore" });
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: /Download a backup/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^runetool-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = { format: "median-xl-runetool", version: 2, data: { "loot-filters": [{ id: "e2e", from: "", filter: {} }] } };
  await dialog.locator("input[type=file]").setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(dialog.getByRole("status")).toContainText("1 loot filter added");
});
