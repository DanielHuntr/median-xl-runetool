<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import Icon from "./AppIcon.vue";
import CopyLink from "./CopyLink.vue";
import DataStatus from "./DataStatus.vue";
import CatalogFilters from "./CatalogFilters.vue";
import FilterPills from "./FilterPills.vue";
import { useRunetool } from "../composables/useRunetool.js";
import SKILL_NAMES from "../data/skill-names.json";
import SOULBINDER from "../data/soulbinder.json";
import BONUSES from "../data/item-bonuses.json";
import { FIX, fixList } from "../data/fixes.js";

const { RW, TUD, SUD, SETD, st } = useRunetool();

// Filters as on the other catalogue pages (CatalogFilters.vue): a list per key, by label.
const state = reactive({ q: "", kinds: [], sources: [], triggers: [] });
// The filters are kept across visits (only the keys the page has, of the same kind).
try {
  const saved = JSON.parse(localStorage.getItem("mxlrw2:oskills")) || {};
  for (const k of Object.keys(state)) if (Array.isArray(state[k]) ? Array.isArray(saved[k]) : typeof saved[k] === "string") state[k] = saved[k];
} catch {}
watch(state, () => { try { localStorage.setItem("mxlrw2:oskills", JSON.stringify(state)); } catch {} }, { deep: true });
const KINDS = [["oskill", "Oskills"], ["proc", "Procs"]];
const OSKILL = /^\+(?:\d+|\(\d+ to \d+\)) to (.+?)(?: \((\w+) Only\))?$/;
const PROC = /^(\d+(?:\.\d+)?)% Chance to cast level (\d+) (.+?) (on .+|when .+)$/i;
const SKILL_LEVELS = /Skill Levels$/i;
const NOT_SKILL = /^(Strength|Dexterity|Vitality|Energy|Life|Mana|Maximum Damage|Minimum Damage|Attack Rating|Defense|Light Radius|All Attributes|Maximum Stamina|All Skills)$/i;

const sourceKinds = [
  ["runeword", "Runewords"],
  ["tiered", "Tiered uniques"],
  ["sacred", "Sacred uniques"],
  ["set", "Sets"],
  ["soulbinder", "Soulbinder Gloves"],
  ["relic", "Relics"],
  ["charm", "Charms"],
  ["scroll", "Scrolls of enchantment"],
  ["echo", "Echo Sabre"],
];
// Every item's "+N to Skill" and chance-to-cast lines that name a real skill (the game's own
// skill names, scripts/extract-affixes.mjs), so "+3 to Fire Skills" or "+20 to Strength" don't.
const KNOWN = new Set(SKILL_NAMES.names);
// Relics and charms come from the planner's data (fetched on arrival, as site search does).
const inventory = ref([]);
const inventoryNote = ref("");
async function loadInventory() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}planner/data.json?v=${__BUILD_ID__}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    inventory.value = (data.inventory || []).map((c) => ({ ...c, lines: fixList(c.lines, FIX.inventory?.[c.id]) }));
  } catch {
    inventoryNote.value = "Relics and charms couldn't be loaded, so they aren't listed.";
  }
  // Echo Sabre (Mastercrafted) rolls procs only, from the game's rare affixes that fit it
  // (src/data/affixes.json, loaded only here and in the planner).
  try {
    const A = (await import("../data/affixes.json")).default;
    const types = A.bases["Echo Sabre (Mastercrafted)"]?.Mastercrafted || [];
    echoProcs.value = A.affixes.filter((a) => a.rare && a.types.some((t) => types.includes(t)) && !(a.not || []).some((t) => types.includes(t)))
      .flatMap((a) => a.lines.filter((l) => PROC.test(l)));
  } catch {}
}
const echoProcs = ref([]);

function rangeHigh(text) {
  const m = /^\((\d+) to (\d+)\)$/.exec(text);
  return m ? Number(m[2]) : Number(text) || 0;
}
function reqOf(lines) {
  const l = lines.find((x) => /^Required Level: /.test(x));
  return l ? Number(l.split(": ")[1]) || null : null;
}
function addLine(out, line, src) {
  let m = OSKILL.exec(line);
  if (m && !SKILL_LEVELS.test(m[1]) && !NOT_SKILL.test(m[1]) && KNOWN.has(m[1])) {
    const amount = /^\+(.+?) to /.exec(line)?.[1] || "0";
    out.push({ kind: "oskill", skill: m[1], value: rangeHigh(amount), line, ...src });
    return;
  }
  m = PROC.exec(line);
  if (m && KNOWN.has(m[3])) out.push({ kind: "proc", skill: m[3], chance: Number(m[1]), level: Number(m[2]), trigger: m[4], line, ...src });
}
function itemLink(source, name) {
  return `${source}?name=${encodeURIComponent(name)}`;
}

const entries = computed(() => {
  const out = [];
  for (const r of RW) for (const line of r.stats)
    addLine(out, line, { source: "runeword", item: r.name, sub: r.runes.join(" "), req: r.lvl, link: itemLink("runewords", r.name) });
  for (const u of TUD) u.t.forEach((tier, i) => {
    const req = tier.req;
    for (const line of tier.mods) addLine(out, line, { source: "tiered", item: u.name, sub: `${u.base} (${i + 1})`, req, link: itemLink("uniques", u.name) });
  });
  for (const u of SUD.value) for (const line of u.lines)
    addLine(out, line, { source: "sacred", item: u.name, sub: u.base, req: u.req, link: itemLink("sacred-uniques", u.name) });
  for (const set of SETD.value) {
    for (const b of set.bonuses) for (const line of b.lines)
      addLine(out, line, { source: "set", item: set.name, sub: b.when.replace(/:$/, ""), req: set.minReq, link: itemLink("sets", set.name) });
    for (const item of set.items) for (const line of item.lines)
      addLine(out, line, { source: "set", item: item.name, sub: `${set.name} · ${item.base}`, req: item.req ?? reqOf(item.raw || []), link: itemLink("sets", set.name) });
  }
  // Soulbinder Gloves roll one oskill from the game's own table; a skill some rolls share is
  // one source with each range it can roll.
  const ranges = new Map();
  for (const r of SOULBINDER.rolls) (ranges.get(r.skill) || ranges.set(r.skill, []).get(r.skill)).push(r);
  for (const [skill, rs] of ranges) {
    const amount = rs.map((r) => r.min === r.max ? r.min : `(${r.min} to ${r.max})`).join(" or ");
    out.push({
      kind: "oskill", skill, value: Math.max(...rs.map((r) => r.max)), line: `+${amount} to ${skill}`,
      source: "soulbinder", item: "Soulbinder Gloves", sub: `Mastercrafted · rolls one of ${ranges.size} skills`, req: null,
      link: itemLink("base-items", "Soulbinder Gloves (Mastercrafted)"),
    });
  }
  // Relics and charms (the planner's data) and scrolls of enchantment (the game's cube recipes):
  // no page shows them on their own, so no link.
  for (const c of inventory.value) for (const line of c.lines)
    addLine(out, line, { source: c.kind === "relic" ? "relic" : "charm", item: c.name, sub: c.kind === "relic" ? "Relic · up to 3 carried" : "Charm", req: c.reqLevel ?? null, link: null });
  for (const line of new Set(echoProcs.value))
    addLine(out, line, { source: "echo", item: "Echo Sabre", sub: "Mastercrafted · procs only, can repeat", req: null, link: itemLink("base-items", "Echo Sabre (Mastercrafted)") });
  for (const sc of BONUSES.scrolls) for (const line of sc.lines)
    addLine(out, line, { source: "scroll", item: sc.name, sub: sc.slot ? `Cubed with ${sc.slot === "body" ? "body armor" : sc.slot}` : `Cubed with ${sc.cat.toLowerCase()}`, req: null, link: null });
  return out;
});
const grouped = computed(() => {
  const words = state.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = entries.value.filter((e) =>
    (!state.kinds.length || state.kinds.includes(KINDS.find(([k]) => k === e.kind)[1])) &&
    (!state.sources.length || state.sources.includes(labelOf(e.source))) &&
    (!state.triggers.length || (e.kind === "proc" && state.triggers.includes(e.trigger))) &&
    (e.req == null || e.req <= st.lvl) &&
    words.every((w) => `${e.skill} ${e.item} ${e.sub} ${e.line}`.toLowerCase().includes(w)),
  );
  const map = new Map();
  for (const e of visible) (map.get(e.skill) || map.set(e.skill, []).get(e.skill)).push(e);
  return [...map.entries()].map(([skill, sources]) => ({
    skill,
    sources: sources.sort((a, b) => (a.req ?? 999) - (b.req ?? 999) || a.item.localeCompare(b.item)),
  })).sort((a, b) => a.skill.localeCompare(b.skill));
});
const triggers = computed(() => [...new Set(entries.value.filter((e) => e.kind === "proc").map((e) => e.trigger))].sort());
const totalSources = computed(() => grouped.value.reduce((n, g) => n + g.sources.length, 0));
const clear = () => { state.q = ""; state.kinds = []; state.sources = []; state.triggers = []; };
function labelOf(source) { return sourceKinds.find(([k]) => k === source)?.[1] || source; }
const sections = computed(() => [
  { key: "kinds", title: "Type", options: KINDS.map(([, l]) => l) },
  { key: "sources", title: "Source", options: sourceKinds.map(([, l]) => l) },
  { key: "triggers", title: "Proc trigger", note: "Procs that fire on any chosen trigger", options: triggers.value },
]);
// A link to one skill (#oskills?name=Charm) searches for it, on arrival or while on the page.
function applyLink() {
  const [page, qs] = window.location.hash.slice(1).split("?");
  if (page !== "oskills" || !qs) return;
  const name = new URLSearchParams(qs).get("name");
  if (name) state.q = name;
  // Applied once, then dropped from the address, so a refresh keeps filters chosen since.
  history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}#oskills`);
}
onMounted(() => {
  applyLink();
  loadInventory();
  window.addEventListener("hashchange", applyLink);
});
onUnmounted(() => window.removeEventListener("hashchange", applyLink));
</script>

<template>
  <section aria-label="Oskills and procs">
    <div class="upgrade-note">
      <Icon name="info" />
      <p>
        Find every item that grants a skill (oskill) or casts one by chance (proc), by skill, item or trigger.
        <span>Runewords, uniques, sacred uniques, sets, relics, charms, scrolls of enchantment, and the rolls of Soulbinder Gloves and Echo Sabre.</span>
      </p>
    </div>
    <div class="toolbar">
      <div class="unique-controls oskill-controls">
        <label class="search"><Icon name="search" /><input v-model="state.q" type="search" placeholder="Search skill, item or line" aria-label="Search oskills and procs" /></label>
        <CatalogFilters :model="state" :sections="sections" :count="`${grouped.length} skill${grouped.length === 1 ? '' : 's'}`" />
        <label class="level">Max lvl <input v-model="st.lvl" type="number" min="1" max="150" aria-label="Maximum character level" /></label>
      </div>
      <FilterPills :model="state" :keys="['kinds', 'sources', 'triggers']" />
    </div>
    <div class="results-bar">
      <div class="result-count oskill-count" aria-live="polite">
        <strong>{{ grouped.length }}</strong> skills · <strong>{{ totalSources }}</strong> sources
      </div>
    </div>
    <div class="oskill-list">
      <article v-for="g in grouped" :key="g.skill" class="unique-card oskill-card">
        <div class="card-top">
          <span class="item-kind">{{ g.sources.length }} source{{ g.sources.length === 1 ? "" : "s" }}</span>
          <CopyLink :hash="`oskills?name=${encodeURIComponent(g.skill)}`" :label="g.skill" />
        </div>
        <h2>{{ g.skill }}</h2>
        <ul class="oskill-sources">
          <li v-for="e in g.sources" :key="`${e.source}:${e.item}:${e.line}`">
            <component :is="e.link ? 'a' : 'div'" class="oskill-source" :href="e.link ? `#${e.link}` : undefined">
              <b>{{ e.item }}</b>
              <small>{{ labelOf(e.source) }}<template v-if="e.sub"> · {{ e.sub }}</template><template v-if="e.req"> · lvl {{ e.req }}</template></small>
            </component>
            <span class="oskill-line" :class="{ proc: e.kind === 'proc' }">{{ e.line }}</span>
          </li>
        </ul>
      </article>
    </div>
    <div v-if="!grouped.length" class="empty">
      <h2>Nothing matches.</h2>
      <p>Try another skill name, item name, trigger or source type.</p>
      <button class="btn" @click="clear">Clear filters</button>
    </div>
    <p class="coverage">
      Every runeword, tiered unique, sacred unique and set item line that grants a skill or casts one, checked against the game's {{ KNOWN.size }} skill names; the {{ SOULBINDER.rolls.length }} oskill rolls of Soulbinder Gloves, the procs Echo Sabre can roll and the scrolls of enchantment from the game files; relics and charms from the planner's data. <template v-if="inventoryNote">{{ inventoryNote }}</template> <DataStatus />
    </p>
  </section>
</template>

<style scoped>
.oskill-controls { grid-template-columns: minmax(220px, 1fr) auto auto; }
.oskill-count { font-size: 0.875rem; color: var(--muted); }
.oskill-count strong { color: var(--text); font-size: 1rem; }
.oskill-list { display: grid; gap: 12px; }
.oskill-card h2 { margin-bottom: 10px; }
.oskill-sources { list-style: none; display: grid; gap: 8px; margin: 0; padding: 0; }
.oskill-sources li { display: grid; grid-template-columns: minmax(180px, 0.42fr) minmax(0, 1fr); gap: 10px; align-items: start; padding: 8px; border: 1px solid var(--soft-border); border-radius: 6px; background: var(--field); }
.oskill-source { display: grid; color: var(--text); text-decoration: none; min-width: 0; }
.oskill-sources a:hover b { color: var(--gold); }
.oskill-sources small { color: var(--muted); font-size: 0.75rem; }
.oskill-line { color: var(--magic); font-size: 0.8125rem; line-height: 1.35; }
.oskill-line.proc { color: var(--blue); }
@media (max-width: 760px) {
  .oskill-controls { grid-template-columns: 1fr; }
  .oskill-sources li { grid-template-columns: 1fr; }
}
</style>
