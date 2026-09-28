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

test("a starter build opens with its levelling stages", async ({ page }) => {
  await page.goto("/#builds");
  await page.locator(".starter-wrap", { hasText: "Stormcall" }).first().locator("a.starter-card").click();
  const stages = page.getByRole("group", { name: "Levelling stage" });
  await expect(stages.getByRole("button", { name: "Endgame" })).toHaveAttribute("aria-pressed", "true");
  await expect(stages.getByRole("button", { name: "Normal" })).toHaveClass(/filled/);
  await stages.getByRole("button", { name: "Normal" }).click();
  await expect(page.locator(".planner-toolbar").getByLabel("Character level")).toHaveValue("50");
  await page.getByRole("button", { name: /Where to level/ }).click();
  await expect(page.getByRole("dialog", { name: "Where to level" }).locator("li").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Where to level" })).toHaveCount(0);
});

test("opening a starter build keeps your own build to go back to", async ({ page }) => {
  await page.goto("/#planner");
  await page.getByRole("button", { name: "Amazon" }).first().click();
  const level = page.locator(".planner-toolbar").getByLabel("Character level");
  await level.fill("77");
  await level.press("Enter");
  await page.getByRole("button", { name: /^Add a point to Strength/ }).click();
  await page.goto("/#builds");
  await page.locator(".starter-wrap", { hasText: "Stormcall" }).first().locator("a.starter-card").click();
  const bar = page.getByRole("region", { name: "Opened build" });
  await expect(bar).toContainText("Stormcall");
  await expect(level).toHaveValue("150");
  await bar.getByRole("button", { name: "Back to my build" }).click();
  await expect(level).toHaveValue("77");
  await expect(bar).toHaveCount(0);
});

test("a mercenary hired in Hell says why its level can't be set yet", async ({ page }) => {
  await page.goto("/#planner");
  await page.getByRole("tab", { name: /Mercenary/ }).click();
  await page.locator(".merc-toolbar select").first().selectOption("Shapeshifter");
  await page.locator(".merc-toolbar").getByLabel(/Hired in/).selectOption("Hell");
  await expect(page.locator(".merc-hint")).toContainText("starts at level 90");
});

test("links open one card: a runeword, a unique at a tier, a sacred unique, a set", async ({ page }) => {
  await page.goto("/#uniques?name=Grim%20Fang&tier=3");
  const fang = page.locator("article.found", { hasText: "Grim Fang" });
  await expect(fang).toBeVisible();
  await expect(fang.getByRole("button", { name: "Tier 3", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(fang.getByRole("button", { name: "Copy a link to Grim Fang, tier 3" })).toBeVisible();
  for (const [hash, name] of [["runewords?name=Tailwind", "Tailwind"], ["sacred-uniques?name=The%20Xiphos", "The Xiphos"], ["sets?name=Pantheon", "Pantheon"]]) {
    await page.goto(`/#${hash}`);
    await expect(page.locator("article.found h2", { hasText: name })).toBeVisible();
  }
});

test("a cube recipe link loads that recipe, ready to transmute", async ({ page }) => {
  await page.goto("/#cube?recipe=4792");
  await expect(page.getByText("Loaded: Book of Cain: Item Design + Oil of Craft → Book of Cain: Cube Reagent.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Transmute" }).click();
  await expect(page.getByText("Nothing happens")).toHaveCount(0);
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

test("site search finds a unique and opens its card", async ({ page }) => {
  await page.goto("/#runewords");
  await page.keyboard.press("Control+k");
  const box = page.getByRole("combobox", { name: "Search the site" });
  await expect(box).toBeFocused();
  await box.fill("grim fang");
  await expect(page.getByRole("option").first()).toContainText("Grim Fang");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#uniques/);
  await expect(page.locator("main article.found h2")).toHaveText("Grim Fang");
});

test("site search opens a skill in the planner", async ({ page }) => {
  await page.goto("/#runewords");
  await page.getByRole("button", { name: "Search the site" }).click();
  await page.getByRole("combobox", { name: "Search the site" }).fill("fanged assault");
  await page.getByRole("option", { name: /Fanged Assault/ }).click();
  await expect(page).toHaveURL(/#planner$/);
  await expect(page.locator(".skill-detail")).toContainText("Fanged Assault");
});

test("catalogue filters: uniques with cast speed, then a pill removes it", async ({ page }) => {
  await page.goto("/#uniques");
  const count = page.locator(".result-count strong");
  const all = Number(await count.textContent());
  await page.getByRole("main").getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("button", { name: /^Stats/ }).click();
  await page.locator(".filter-drawer .chips button", { hasText: /^Cast speed$/ }).click();
  await page.getByRole("button", { name: /^Show \d+ uniques?$/ }).click();
  const some = Number(await count.textContent());
  expect(some).toBeGreaterThan(0);
  expect(some).toBeLessThan(all);
  await page.getByRole("button", { name: "Remove Cast speed" }).click();
  await expect(count).toHaveText(String(all));
});


test("the Mercenary tab: hire one, see its stats and its buff", async ({ page }) => {
  await page.goto("/#planner");
  await page.getByRole("tab", { name: /Mercenary/ }).click();
  const bar = page.locator(".merc-toolbar");
  await bar.locator("select").first().selectOption("Bloodmage");
  const view = page.locator(".merc-view");
  await expect(view).toContainText("Firedance");
  await expect(view.getByRole("button", { name: /Mercenary's body armor/ })).toBeVisible();
  await expect(view.getByRole("button", { name: /Mercenary's amulet/ })).toBeVisible();
  await page.getByRole("tab", { name: /Amazon|Assassin|Barbarian|Druid|Necromancer|Paladin|Sorceress/ }).click();
  await expect(page.getByRole("button", { name: /Suggest gear/ })).toBeVisible();
});

test("the mercenary's gear: suggest, then edit an item's sockets", async ({ page }) => {
  await page.goto("/#planner");
  const lvl = page.locator(".planner-toolbar").getByLabel("Character level");
  await lvl.fill("120"); await lvl.press("Enter");
  await page.getByRole("tab", { name: /Mercenary/ }).click();
  await page.locator(".merc-toolbar select").first().selectOption("Ranger");
  await page.locator(".merc-view").getByRole("button", { name: /Suggest gear/ }).click();
  const helm = page.locator(".merc-view").getByRole("button", { name: /Mercenary's helm: .+ Select to edit/ });
  await expect(helm).toBeVisible();
  await helm.click();
  const editor = page.locator(".item-editor");
  await expect(editor).toContainText("Mercenary's helm");
  await expect(editor.getByRole("button", { name: /Suggest orbs and sockets/ })).toHaveCount(0);
  const fill = editor.getByRole("button", { name: /Fill socket 1/ });
  if (await fill.count()) {
    await fill.click();
    await page.getByRole("dialog").filter({ has: page.getByRole("searchbox", { name: "Search items" }) }).locator(".picker-list button, ul li button").first().click();
    await expect(editor.getByRole("button", { name: /^Change$/ }).first()).toBeVisible();
  }
});

test("a unique amulet's Show recipe loads the random-unique recipe", async ({ page }) => {
  await page.goto("/#uniques");
  const card = page.locator(".unique-card", { hasText: "Fren Slairea" }).first();
  await card.locator(".cube-link-square").click();
  await expect(page).toHaveURL(/#cube/);
  await expect(page.locator(".cube-link-note")).toContainText("random unique Amulet");
  await expect(page.locator(".cube-slot")).toHaveCount(4);
});
