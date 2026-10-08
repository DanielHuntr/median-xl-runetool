<script setup>
// Item Upgrades: everything that can be added to an item, from the game files: magic and rare
// affixes (affixes.json), mystic orbs (mystic-orbs.json), and the cube's oils, corruptions,
// shrines, scrolls of enchantment, trophies and cycles (item-bonuses.json). Searchable, with
// what each goes on in the game's own item type names (cube-main.json, loaded with the page).
import { computed, ref, watch } from "vue";
import Icon from "./AppIcon.vue";
import CubeIcon from "./CubeIcon.vue";
import AFFIXES from "../data/affixes.json";
import ORBS from "../data/mystic-orbs.json";
import BONUSES from "../data/item-bonuses.json";

const typeNames = ref({});
// Each item's inventory graphic by its name (the cube data's items and art), for the oils,
// trophies, cycles, scrolls, shrine vessels and the Corrupted Crystal.
const artByName = ref({});
import("../data/cube-main.json").then((m) => {
  typeNames.value = m.default.types || {};
  const art = {};
  for (const [code, name] of m.default.items || []) if (!art[name] && m.default.art?.[code]) art[name] = m.default.art[code];
  artByName.value = art;
}).catch(() => {});
const artOf = (name) => artByName.value[name] || null;
// A mystic orb's graphic is its group's (as in the game: one per kind of item it goes on).
const ORB_ART = { Armor: "orb_armo", Weapon: "orb_weap", Item: "orb_any", "Ring/Amulet/Quiver": "orb_misc" };
const typeName = (t) => typeNames.value[t] || ({ amu: "Amulet", ssgl: "Sacred item", elex: "Elemental weapon", ct2w: "Sacred two-handed weapon", misl: "Quiver" })[t] || t;
const fits = (types) => [...new Set((types || []).map(typeName))].join(", ");

const SAVED = "mxlrw2:upgrades";
const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVED)) || {}; } catch { return {}; } })();
const TABS = [
  ["affixes", "Affixes"], ["orbs", "Mystic orbs"], ["oils", "Oils"], ["corruptions", "Corruptions"],
  ["shrines", "Shrines"], ["scrolls", "Scrolls of enchantment"], ["charms", "Trophies & cycles"],
];
const tab = ref(TABS.some(([t]) => t === saved.tab) ? saved.tab : "affixes");
const q = ref(typeof saved.q === "string" ? saved.q : "");
const kind = ref(["", "p", "s"].includes(saved.kind) ? saved.kind : "");
watch([tab, q, kind], () => { try { localStorage.setItem(SAVED, JSON.stringify({ tab: tab.value, q: q.value, kind: kind.value })); } catch {} });

// Every entry as { title, meta, lines, note }, for one list.
const lists = computed(() => ({
  affixes: AFFIXES.affixes.filter((a) => !kind.value || a.kind === kind.value).map((a) => ({
    key: a.id, title: a.kind === "p" ? "Prefix" : "Suffix", lines: a.lines,
    meta: [`Item level ${a.level}${a.max ? `–${a.max}` : "+"}`, a.req ? `Required level ${a.req}` : null, a.rare ? "Magic, rare and crafted" : "Magic only"].filter(Boolean).join(" · "),
    note: `On: ${fits(a.types)}${a.not?.length ? ` (not ${fits(a.not)})` : ""}`,
  })),
  orbs: ORBS.orbs.map((o) => ({
    key: o.id, title: o.name, lines: o.lines, art: ORB_ART[o.group],
    meta: [o.group, o.unique ? "Unique orb" : null, `Required level +${o.reqLevel}`, `up to ${o.limit} per item`].filter(Boolean).join(" · "),
  })),
  oils: BONUSES.oils.map((o) => ({ key: o.id, title: o.name, art: artOf(o.name.replace(/ or Greater Luck$/, "")), lines: o.lines, meta: `On: ${o.on}`, note: "One oil per item." })),
  corruptions: BONUSES.corruptions.map((c) => ({ key: c.id, title: "Corruption", art: artOf("Corrupted Crystal"), lines: c.lines, meta: `On: ${c.type === "ssgl" ? "any sacred item" : c.on}` })),
  shrines: BONUSES.shrines.map((s) => ({ key: s.id, title: `${s.shrine} Shrine`, art: artOf(`${s.shrine} Shrine Vessel`), lines: s.lines, meta: `On: ${s.category}` })),
  scrolls: BONUSES.scrolls.map((s) => ({ key: s.id, title: s.name, art: artOf(s.name), lines: s.lines, meta: `On: ${s.slot ? s.slot.replace(/^body$/, "body armor") : s.cat}` })),
  charms: [
    ...BONUSES.trophies.map((t) => ({ key: t.id, title: t.name, art: artOf(t.name), lines: t.lines, meta: t.title ? `Trophy · ${t.title}` : "Trophy" })),
    ...BONUSES.cycles.map((c) => ({ key: c.id, title: c.name, art: artOf(c.name), lines: c.lines, meta: "Cycle · cubed into the Corrupted Wormhole" })),
  ],
}));
const NOTES = {
  affixes: "The magic and rare affixes the game rolls, from its affix tables. An affix rolls on an item of at least its item level (and no higher than its maximum).",
  orbs: "Mystic orbs cubed into an item, up to the limit each allows. Each orb raises the item's required level.",
  oils: "Cubed with a kept item, one per item. The game uses the first recipe that fits, so an elemental weapon takes Oil of Luck's attack speed.",
  corruptions: "Cube a sacred item with a Corrupted Crystal, then with an Oil of Craft to reveal one of these. Rings, amulets and jewels count as sacred. One per item.",
  shrines: "A shrine's set of bonuses, added by crafting a sacred rare, crafted or honorific item with it (and again by blessing it).",
  scrolls: "One scroll of enchantment per item.",
  charms: "A challenge charm's trophy, and the cycles cubed into the Corrupted Wormhole.",
};
const words = computed(() => q.value.toLowerCase().split(/\s+/).filter(Boolean));
const shown = computed(() => {
  const all = lists.value[tab.value] || [];
  if (!words.value.length) return all;
  return all.filter((e) => { const hay = `${e.title} ${e.meta} ${e.note || ""} ${e.lines.join(" ")}`.toLowerCase(); return words.value.every((w) => hay.includes(w)); });
});
const limit = ref(60);
watch([tab, q, kind], () => (limit.value = 60));
</script>

<template>
  <section class="upgrades">
    <div class="tabs upgrade-tabs" role="tablist" aria-label="Kind of upgrade">
      <button v-for="[id, label] in TABS" :key="id" role="tab" :aria-selected="tab === id" :tabindex="tab === id ? 0 : -1" @click="tab = id">{{ label }}</button>
    </div>
    <p class="muted upgrade-note">{{ NOTES[tab] }}</p>
    <div class="upgrade-controls">
      <label class="search"><Icon name="search" /><input v-model="q" type="search" placeholder="Search by stat, e.g. life or attack speed" aria-label="Search upgrades" /></label>
      <select v-if="tab === 'affixes'" v-model="kind" aria-label="Prefixes or suffixes">
        <option value="">Prefixes and suffixes</option>
        <option value="p">Prefixes</option>
        <option value="s">Suffixes</option>
      </select>
    </div>
    <p class="result-count"><strong>{{ shown.length }}</strong> {{ shown.length === 1 ? "entry" : "entries" }}</p>
    <ul class="upgrade-list">
      <li v-for="e in shown.slice(0, limit)" :key="e.key" class="upgrade">
        <div class="upgrade-head">
          <CubeIcon v-if="e.art" :art="e.art" :size="40" />
          <p class="upgrade-title">{{ e.title }}<small v-if="e.meta">{{ e.meta }}</small></p>
        </div>
        <ul class="stats"><li v-for="l in e.lines" :key="l">{{ l }}</li></ul>
        <p v-if="e.note" class="upgrade-fits">{{ e.note }}</p>
      </li>
    </ul>
    <button v-if="shown.length > limit" type="button" class="btn show-more" @click="limit += 120">Show more ({{ shown.length - limit }} left)</button>
    <div v-if="!shown.length" class="empty"><h2>Nothing matches.</h2></div>
  </section>
</template>

<style scoped>
.upgrade-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.upgrade-tabs button { padding: 7px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--muted); font-size: 0.8125rem; }
.upgrade-tabs button[aria-selected="true"] { border-color: var(--gold); color: var(--gold); background: var(--gold-bg); }
.upgrade-note { margin: 0 0 14px; max-width: 72ch; }
.upgrade-controls { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.upgrade-controls .search { flex: 1; min-width: 220px; margin: 0; }
.upgrade-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.upgrade { padding: 14px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
.upgrade-head { display: flex; align-items: center; gap: 12px; margin: 0 0 8px; }
.upgrade-title { display: grid; gap: 2px; margin: 0; color: var(--gold); font-weight: 600; }
.upgrade-title small { color: var(--muted); font-weight: 400; font-size: 0.75rem; }
.upgrade .stats { margin: 0; }
.upgrade-fits { margin: 8px 0 0; color: var(--muted); font-size: 0.75rem; line-height: 1.45; }
.show-more { margin: 16px auto 0; display: flex; }
</style>
