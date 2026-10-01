// The main pages in a real browser: they load, and their key actions work end to end.
import { test, expect } from "@playwright/test";
import { openBuild } from "./fixtures/builds.mjs";

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

test("opening a shared build keeps your own build to go back to", async ({ page }) => {
  await page.goto("/#planner");
  await page.getByRole("button", { name: "Amazon" }).first().click();
  const level = page.locator(".planner-toolbar").getByLabel("Character level");
  await level.fill("77");
  await level.press("Enter");
  await page.getByRole("button", { name: /^Add a point to Strength/ }).click();
  await openBuild(page, "Stormcall");
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

test("an item's unused lines are grouped at the bottom, shown with why on a sheet pinned with Alt", async ({ page }) => {
  await openBuild(page, "Stormcall");
  const tip = page.locator("#planner-tip");
  // The first equipped item with a line the build can't use.
  const slots = page.locator("button.doll-slot.filled");
  await expect(slots.first()).toBeVisible();
  let found = false;
  for (let i = 0; i < (await slots.count()) && !found; i++) {
    await slots.nth(i).hover();
    await expect(tip).toBeVisible();
    found = (await tip.locator(".sheet-unused").count()) > 0;
  }
  expect(found, "some Stormcall item has a line it can't use").toBe(true);
  const group = tip.locator(".sheet-unused");
  await expect(group).toContainText(/Unused by this build \(\d+\) · Alt to pin and show/);
  await expect(group.locator(".unused-list")).toHaveCount(0);
  await page.keyboard.press("Alt");
  await expect(tip).toHaveClass(/pinned/);
  // The sheet stays while the pointer moves onto it; the group opens with each line's reason.
  const toggle = group.getByRole("button", { name: /Unused by this build/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(group.locator(".unused-list li small").first()).toHaveText(/wrong damage type|no attacks|no damage spells|no summons|no spells/);
  // Scrolling doesn't close a pinned sheet; moving the pointer away from it does.
  await page.mouse.wheel(0, 200);
  await expect(tip).toBeVisible();
  const box = await tip.boundingBox();
  // Anywhere outside the sheet closes it (the page's top-left corner is clear of other tooltips).
  await page.mouse.move(2, 2);
  await expect(tip).toHaveCount(0);
});

test("the charm list shows its count, scrolls within the equipment column, and folds from its heading", async ({ page }) => {
  await openBuild(page, "Hammer of Zerae");
  const charms = page.locator(".charms");
  const toggle = charms.getByRole("button", { name: /Charms & relics/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(charms.locator(".charms-count")).toHaveText(/^\d+$/);
  const list = charms.locator("#charm-list");
  await expect(list.locator("li").first()).toBeVisible();
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight), "a long list scrolls").toBe(true);
  await toggle.click();
  await expect(charms.locator(".charms-summary")).toContainText(/charms?/);
});

test("the skill summary opens from the skill points counter, and a skill in it opens its tree", async ({ page }) => {
  await openBuild(page, "Snake Bite");
  await page.getByRole("button", { name: "Summary" }).click();
  const dialog = page.getByRole("dialog", { name: /Skill summary/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("li").first()).toBeVisible();
  await dialog.getByRole("button", { name: /Lion Stance/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Nomad/ })).toHaveAttribute("aria-selected", "true");
});

test("a build's author sets its tiers in the planner, and its saved card shows them", async ({ page }) => {
  await openBuild(page, "Snake Bite");
  await page.getByRole("button", { name: "Rate this build" }).click();
  const tiers = page.getByRole("dialog", { name: "Your tiers for this build" });
  await tiers.getByRole("group", { name: "Overall tier" }).getByRole("button", { name: "A" }).click();
  await tiers.getByRole("group", { name: "Bossing tier" }).getByRole("button", { name: "S" }).click();
  await tiers.getByRole("group", { name: "Survival tier" }).getByRole("button", { name: "C" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".build-tiers-open")).toContainText("Bossing S");
  await page.getByRole("button", { name: "Save build" }).click();
  const dialog = page.getByRole("dialog", { name: "Save build" });
  await dialog.getByLabel("Name").fill("My Snake Bite");
  await dialog.getByRole("button", { name: /^Save/ }).click();
  await page.goto("/#builds");
  const card = page.locator("article.build-card.mine", { hasText: "My Snake Bite" });
  await expect(card.locator(".tier-badge")).toHaveText("A");
  await expect(card.locator(".mine-tiers")).toContainText("Bossing S");
  await expect(card.locator(".mine-tiers")).toContainText("Survival C");
  await expect(card.locator(".mine-tiers")).not.toContainText("Clearing");
});

test("a saved build opened, then a shared build, goes back to the saved build by its name", async ({ page }) => {
  await openBuild(page, "Hammer of Zerae");
  await page.getByRole("button", { name: "Save build" }).click();
  const dialog = page.getByRole("dialog", { name: "Save build" });
  await dialog.getByLabel("Name").fill("My Hammer");
  await dialog.getByRole("button", { name: /^Save/ }).click();
  // Something else of the player's first (unsaved), so opening the saved build sets that aside.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset" }).click();
  await openBuild(page, "Spear: Fend");
  await expect(page.locator(".build-name")).toHaveText("Spear: Fend");
  await page.goto("/#builds");
  await page.locator("article.build-card.mine", { hasText: "My Hammer" }).getByRole("link", { name: "Open build" }).click();
  await expect(page.locator(".build-name")).toHaveText("My Hammer");
  await page.reload();
  await expect(page.locator(".build-name"), "the name survives a reload").toHaveText("My Hammer");
  await openBuild(page, "Stormcall");
  await expect(page.locator(".build-name")).toHaveText("Stormcall");
  await page.getByRole("button", { name: "Back to my build" }).click();
  await expect(page.locator(".build-name")).toHaveText("My Hammer");
});

test("on a short screen the sidebar scrolls to its last item, and there's no Help confirm values page", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 560 });
  await page.goto("/#runewords");
  const side = page.locator(".sidebar");
  await expect(side).not.toContainText("Help confirm values");
  const last = side.locator(".side-collapse");
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect(await side.evaluate((el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === "auto")).toBe(true);
  // The tablet rail too.
  await page.setViewportSize({ width: 800, height: 520 });
  expect(await side.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
});

test("the sidebar's Sign in opens the account dialog, which asks for a valid email", async ({ page }) => {
  await page.goto("/#runewords");
  await page.locator(".sidebar").getByRole("button", { name: "Sign in" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign in" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Email").fill("not-an-email");
  await dialog.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
