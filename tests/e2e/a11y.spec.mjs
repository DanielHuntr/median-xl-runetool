// Accessibility: axe-core on every page and the main dialogs. Serious and critical problems fail.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openBuild } from "./fixtures/builds.mjs";

const PAGES = ["runewords", "uniques", "sacred-uniques", "sets", "oskills", "socketables", "base-items", "upgrades", "cube", "planner", "builds", "filters"];
const problems = async (page, include) => {
  let axe = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (include) axe = axe.include(include);
  const { violations } = await axe.analyze();
  return violations.filter((v) => ["serious", "critical"].includes(v.impact))
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}${v.nodes.length > 3 ? ` +${v.nodes.length - 3}` : ""}`);
};

for (const p of PAGES) {
  test(`page: ${p}`, async ({ page }) => {
    await page.goto(`/#${p}`);
    await page.waitForLoadState("networkidle");
    expect(await problems(page)).toEqual([]);
  });
}

test("dialogs: site search, filters, backup", async ({ page }) => {
  await page.goto("/#uniques");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search the site" }).fill("fang");
  expect(await problems(page, ".site-search")).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByRole("main").getByRole("button", { name: /^Filters/ }).click();
  expect(await problems(page, ".filter-drawer[open]")).toEqual([]);
  await page.keyboard.press("Escape");
  await page.locator(".sidebar").getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Back up & restore" }).click();
  expect(await problems(page, ".backup")).toEqual([]);
  await page.keyboard.press("Escape");
});

test("tabs move with the arrow keys", async ({ page }) => {
  await page.goto("/#filters");
  const community = page.getByRole("tab", { name: "Community filters" });
  await community.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /My filters/ })).toBeFocused();
  await expect(page.getByRole("tab", { name: /My filters/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(community).toHaveAttribute("aria-selected", "true");
});

test("Esc closes the site search even with text typed", async ({ page }) => {
  await page.goto("/#runewords");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search the site" }).fill("eth");
  await page.keyboard.press("Escape");
  await expect(page.locator(".site-search")).not.toBeVisible();
});

test("planner: More menu, item editor and its searchable list", async ({ page }) => {
  await openBuild(page, "Stormcall");
  await page.waitForSelector(".planner-layout");
  await page.getByRole("button", { name: "More planner actions" }).click();
  expect(await problems(page, ".more-menu")).toEqual([]);
  await page.keyboard.press("Escape");
  await page.locator(".doll-slot:not([aria-label*='empty'])").first().click();
  await page.waitForSelector(".item-editor");
  expect(await problems(page, ".item-editor-modal")).toEqual([]);
  const add = page.getByRole("button", { name: "Add a mystic orb" });
  if (await add.count()) {
    await add.click();
    expect(await problems(page, ".search-select-pop")).toEqual([]);
  }
});
