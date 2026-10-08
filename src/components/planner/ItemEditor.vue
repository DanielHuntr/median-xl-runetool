<script setup>
import CubeLink from "../CubeLink.vue";
import { computed } from "vue";
import { ORBS, orbById, orbFits, orbMultiplier } from '../../planner/orbs.js';
import ItemIcon from "./ItemIcon.vue";
import { usePlanner } from "../../planner/usePlanner.js";
import ItemBonuses from "./ItemBonuses.vue";
import ItemAffixes from "./ItemAffixes.vue";
import { SLOTS } from "../../planner/items.js";
import { MERC_SLOTS } from "../../planner/mercs.js";
import { pointsFor } from "../../planner/character.js";
import { superiorVariants, superiorLabel, superiorNames } from "../../planner/superior.js";

const props = defineProps({ slot: { type: String, required: true } });
const { catalog, build, character, updateItem, unequip, state, openPicker, applyFix, emptySockets, fillEmptySockets, fillSockets, clearSockets, enhance, canAddOrb, addOrb, gearItem, itemLevel } =
  usePlanner();
// "merc:<slot>": one of the mercenary's items (its level, strength and dexterity apply; the
// suggestions, which score items for your build, don't).
const mercKey = computed(() => (props.slot.startsWith("merc:") ? props.slot.slice(5) : null));

const item = computed(() => gearItem(props.slot));
const ethereal = computed(() => item.value?.ethereal || r.value?.lines.some(l => /\bethereal\b/i.test(l)));
const availableOrbs = computed(() => ORBS.filter(o => (!o.unique || state.includeUniqueOrbs) && orbFits(o, r.value.def, r.value.lines, item.value)));
// The item's orbs, one row per kind with its count (four Lifesteal orbs are one "×4" row).
const orbGroups = computed(() => {
  const out = new Map();
  for (const id of item.value?.orbs || []) out.set(id, (out.get(id) || 0) + 1);
  return [...out].map(([id, n]) => ({ id, n, orb: orbById(id) })).filter((g) => g.orb);
});
function removeOrb(id) {
  const orbs = [...(item.value.orbs || [])];
  orbs.splice(orbs.lastIndexOf(id), 1);
  updateItem(props.slot, { orbs });
}
// Choosing an orb in the list adds it; the list goes back to its prompt.
function chooseOrb(e) {
  const id = e.target.value;
  if (id) addOrb(props.slot, id);
  e.target.value = "";
}
const r = computed(() => (!mercKey.value && character.value.equipped[props.slot]) || (item.value && catalog.resolve(item.value, itemLevel(props.slot))));
const inactive = computed(() => !mercKey.value && item.value && !character.value.equipped[props.slot]);
const slotLabel = computed(() => (mercKey.value ? `Mercenary's ${MERC_SLOTS.find((s) => s.id === mercKey.value)?.label.toLowerCase()}` : SLOTS.find((s) => s.id === props.slot)?.label));

const variants = computed(() => {
  const d = r.value?.baseDef || r.value?.def;
  if (!d?.variants || d.variants.length < 2) return [];
  const need = r.value.def.kind === "runeword" ? r.value.def.runes.length : 0;
  return d.variants.map((v, i) => ({
    i,
    label: v.label,
    ok: !need || v.lines.some((l) => (parseInt(/^Socketed \((\d)\)/.exec(l)?.[1] || "0", 10)) >= need),
  }));
});
const variantKey = computed(() => (r.value?.baseDef ? "baseVariant" : "variant"));
const currentVariant = computed(() => {
  const n = variants.value.length;
  return Math.min(item.value?.[variantKey.value] ?? n - 1, n - 1);
});
const setVariant = (i) => updateItem(props.slot, { [variantKey.value]: Number(i), rolls: [] });

function rollValue(i) {
  const x = r.value.ranges[i];
  const t = item.value.rolls?.[i] ?? 1;
  return x.min + (x.max - x.min) * t;
}
// A roll's line as the item shows it: every range in it at its current value, the one this
// slider sets marked ("Adds 15-25 Damage" for "Adds 15-(16 to 25) Damage").
const RANGE = /\((-?[\d.]+) to (-?[\d.]+)\)/g;
// A roll as the game writes it: whole numbers whole (a third of the way from 10 to 40 is 20).
const shown = (i) => (step(r.value.ranges[i]) === 1 ? String(Math.round(rollValue(i))) : String(Math.round(rollValue(i) * 100) / 100));
function rollParts(i) {
  const line = r.value.ranges[i].line;
  const first = r.value.ranges.findIndex((x) => x.line === line);
  const parts = [];
  let last = 0, k = 0;
  for (const m of line.matchAll(RANGE)) {
    parts.push({ text: line.slice(last, m.index) });
    const j = first + k++;
    parts.push({ text: shown(j), mine: j === i });
    last = m.index + m[0].length;
  }
  parts.push({ text: line.slice(last) });
  return parts;
}
const step = (x) => (String(x.min).includes(".") || String(x.max).includes(".") ? 0.01 : 1);
function setRoll(i, v) {
  const x = r.value.ranges[i];
  const rolls = [...(item.value.rolls || [])];
  while (rolls.length < r.value.ranges.length) rolls.push(1);
  rolls[i] = x.max === x.min ? 1 : (Number(v) - x.min) / (x.max - x.min);
  updateItem(props.slot, { rolls });
}
const allRolls = (t) => updateItem(props.slot, { rolls: r.value.ranges.map(() => t) });

// Superior quality (game files): bases and runewords only, with the variants for its type.
const qualities = computed(() => (r.value?.canBeSuperior ? superiorVariants(r.value.def.slotType) : []));
const setQuality = (v) => {
  // The item's own rolls come first; a superior variant's ranges follow them, so switching
  // quality drops only the old variant's rolls.
  const own = r.value.ranges.length - (r.value.superior ? r.value.ranges.filter((x) => r.value.superior.lines.includes(x.line)).length : 0);
  updateItem(props.slot, { superior: v === "" ? undefined : Number(v), rolls: (item.value.rolls || []).slice(0, own) });
};
const names = computed(() => superiorNames(r.value));
// Affixes' and added bonuses' ranges follow the item's own, so changing either keeps only the
// item's own rolls.
function ownRolls() {
  const added = new Set([...(r.value.addons || []), ...(r.value.affixes?.picked || [])].flatMap((b) => b.lines));
  return (item.value.rolls || []).slice(0, r.value.ranges.filter((x) => !added.has(x.line)).length);
}
const setAddons = (addons) => updateItem(props.slot, { addons, rolls: ownRolls() });
const setAffixes = ({ affixes, magic, crafted, ilvl }) => updateItem(props.slot, { affixes: affixes.length ? affixes : undefined, magic: magic || undefined, crafted: crafted || undefined, ilvl, rolls: ownRolls() });
const canPickSockets = computed(() => ["base", "custom"].includes(r.value?.def.kind) && !r.value.mastercrafted);
const setSocketCount = (n) => updateItem(props.slot, { socketCount: Number(n) });
// Empty sockets left on this item, for "Fill empty" on a filled socket.
const empty = computed(() => (r.value?.def.kind === "runeword" ? [] : emptySockets(props.slot)));
const anyFilled = computed(() => r.value?.def.kind !== "runeword" && (item.value?.sockets || []).some(Boolean));
function clearSocket(i) {
  const sockets = [...(item.value.sockets || [])];
  sockets[i] = null;
  updateItem(props.slot, { sockets });
}
const lineClass = (p) =>
  ({ stats: "counted", skill: "counted", oskill: "counted", info: "info", unknown: "unknown" })[p.kind] || "effect";
const reqs = computed(() => {
  const h = r.value.head;
  if (mercKey.value) {
    const m = character.value.merc;
    return [
      h.reqLevel && { t: `Level ${h.reqLevel}`, ok: (m?.level ?? 0) >= h.reqLevel },
      h.reqStr && { t: `Str ${h.reqStr}`, ok: (m?.strength ?? 0) >= h.reqStr },
      h.reqDex && { t: `Dex ${h.reqDex}`, ok: (m?.dexterity ?? 0) >= h.reqDex },
    ].filter(Boolean);
  }
  const a = character.value.attributes;
  return [
    h.reqLevel && {
      t: `Level ${h.reqLevel}`,
      ok: build.value.level >= h.reqLevel,
      fix: { kind: "level", level: h.reqLevel },
      label: `Set level ${h.reqLevel}`,
    },
    h.reqStr && {
      t: `Str ${h.reqStr}`,
      ok: a.strength.total >= h.reqStr,
      fix: { kind: "attr", attr: "strength", amount: pointsFor(a.strength, h.reqStr) },
      label: `Add ${pointsFor(a.strength, h.reqStr)} Str`,
    },
    h.reqDex && {
      t: `Dex ${h.reqDex}`,
      ok: a.dexterity.total >= h.reqDex,
      fix: { kind: "attr", attr: "dexterity", amount: pointsFor(a.dexterity, h.reqDex) },
      label: `Add ${pointsFor(a.dexterity, h.reqDex)} Dex`,
    },
    r.value.cls && { t: `${r.value.cls} only`, ok: r.value.cls === state.cls },
  ].filter(Boolean);
});
// The Stats preview: the item's own lines, then what's been added to it, each under its
// source, so a change on the right shows where it lands. Added bonuses' lines follow the
// item's own (items.js); a kind of orb or socket filler used more than once is one entry with
// its total ("Elemental Resists +15%" for five +3% orbs).
const times = (text, n) => {
  if (n === 1) return text;
  const nums = text.match(/\d+(?:\.\d+)?/g) || [];
  return nums.length === 1 ? text.replace(nums[0], String(Math.round(Number(nums[0]) * n * 100) / 100)) : `${text} (×${n})`;
};
const grouped = (entries) => {
  const out = new Map();
  for (const e of entries) {
    const g = out.get(e.key) || out.set(e.key, { name: e.name, n: 0, parsed: e.parsed }).get(e.key);
    g.n++;
  }
  return [...out.values()].flatMap((g) => g.parsed.map((p) => ({ ...p, text: times(p.text, g.n), from: g.n > 1 ? `${g.name} ×${g.n}` : g.name })));
};
const preview = computed(() => {
  const added = (r.value.addons || []).reduce((n, b) => n + b.lines.length, 0);
  const all = r.value.parsed;
  const groups = [{ title: "", lines: all.slice(0, all.length - added) }];
  if (added) {
    const from = (r.value.addons || []).flatMap((b) => b.lines.map(() => (b.shrine ? `${b.shrine} Shrine` : b.name || "")));
    groups.push({ title: "Added bonuses", lines: all.slice(all.length - added).map((p, k) => ({ ...p, from: from[k] })) });
  }
  const orbs = grouped((r.value.orbs || []).map((o) => ({ key: o.def.id, name: o.def.name, parsed: o.parsed })));
  if (orbs.length) groups.push({ title: "Mystic orbs", lines: orbs });
  if (r.value.def.kind !== "runeword") {
    const fills = grouped((r.value.sockets || []).filter(Boolean).map((x) => ({ key: x.def.key + x.lines.join(), name: x.def.name, parsed: x.parsed || [] })));
    if (fills.length) groups.push({ title: "Sockets", lines: fills });
  }
  return groups.filter((g) => g.lines.length);
});
// The item's own settings (tier, quality, sockets, honorific), when it has any.
const hasBaseControls = computed(() => variants.value.length || qualities.value.length || (canPickSockets.value && r.value.maxSockets) || (r.value.def.kind === "base" && !r.value.mastercrafted));
// "Show recipe" when the cube makes this item: a unique (at its tier) or a base item's tier.
const cubeLink = computed(() => {
  const d = r.value?.def;
  if (!d) return null;
  const tier = +(/Tier (\d)/.exec(r.value.label || "")?.[1] || 0);
  if (d.kind === "unique" || d.kind === "sacred") return { kind: "unique", name: d.name, tier };
  if (d.kind === "base" && tier) return { kind: "item", name: `${d.name} (${tier})` };
  return null;
});
</script>
<template>
  <section v-if="item && r" id="item-editor" tabindex="-1" class="item-editor" :aria-label="`${slotLabel}: ${r.def.name}`">
    <header class="item-editor-head">
      <ItemIcon :icon="r.def.icon" />
      <div class="item-editor-title">
        <div class="item-kind">{{ slotLabel }} · {{ r.def.kindLabel }}</div>
        <h2 :class="'q-' + r.def.kind">{{ names.name }}</h2>
        <p class="base">
          {{ names.base || r.def.cat }}<template v-if="r.label"> · {{ r.label }}</template>
        </p>
        <CubeLink v-if="cubeLink" v-bind="cubeLink" />
      </div>
      <div class="item-editor-actions">
        <button class="btn" @click="openPicker(mercKey ? { mode: 'merc', slot: mercKey } : { mode: 'slot', slot })">Change item</button>
        <button class="btn btn-quiet" @click="unequip(slot)">Remove</button>
      </div>
    </header>

    <p v-if="inactive" class="warning">This slot belongs to the other weapon set, so it isn't counted right now.</p>
    <div class="unique-meta item-editor-meta">
      <span v-for="q in reqs" :class="{ warning: !q.ok }"
        ><b>{{ q.t }}</b
        ><button v-if="!q.ok && q.fix" class="fix-btn" @click="applyFix(q.fix)">{{ q.label }}</button></span
      >
      <span v-if="r.head.damage"
        >{{ r.head.damage.type }} damage <b>{{ Math.floor(r.head.damage.min) }}–{{ Math.floor(r.head.damage.max) }}</b></span
      >
      <span v-if="r.head.defense != null">Defense <b>{{ Math.floor(r.head.defense) }}</b></span>
      <span v-if="r.head.block != null">Block <b>{{ r.head.block }}%{{ r.head.blockClass ? " + class" : "" }}</b></span>
    </div>

    <div class="editor-grid">
      <!-- The item as it is now: every change on the right shows here at once. -->
      <aside class="editor-preview" aria-label="Item stats">
        <h3>Stats</h3>
        <template v-for="g in preview" :key="g.title">
          <h4 v-if="g.title" class="preview-group">{{ g.title }}</h4>
          <ul class="item-lines">
            <li v-for="(p, k) in g.lines" :key="k" :class="lineClass(p)">
              {{ p.text }}<small v-if="p.from"> · {{ p.from }}</small
              ><small v-if="p.kind === 'unknown'"> · not counted</small
              ><small v-else-if="p.kind === 'oskill'"> · oskill</small
              ><small v-else-if="p.kind === 'proc' || p.kind === 'feature' || p.kind === 'skillmod'"> · effect, not a stat</small>
            </li>
          </ul>
        </template>
      </aside>

      <div class="editor-controls">
        <div v-if="hasBaseControls" class="editor-section">
          <h3>Item</h3>
          <div class="editor-form">
            <label v-if="variants.length"
              ><span>{{ r.def.kind === "runeword" ? "Base tier" : "Tier" }}</span>
              <select :value="currentVariant" @change="setVariant($event.target.value)">
                <option v-for="v in variants" :value="v.i" :disabled="!v.ok">{{ v.label }}{{ v.ok ? "" : " (too few sockets)" }}</option>
              </select></label
            >
            <label v-if="qualities.length"
              ><span>Quality</span>
              <select :value="r.superior ? r.superior.id : ''" @change="setQuality($event.target.value)">
                <option value="">Normal</option>
                <option v-for="q in qualities" :key="q.id" :value="q.id">{{ superiorLabel(q) }}</option>
              </select></label
            >
            <label v-if="canPickSockets && r.maxSockets"
              ><span>Sockets</span>
              <select :value="r.socketCount" @change="setSocketCount($event.target.value)">
                <option v-for="n in r.maxSockets + 1" :value="n - 1">{{ n - 1 }}</option>
              </select></label
            >
            <label v-if="r.def.kind === 'base' && !r.mastercrafted" class="editor-check"
              ><span>Honorific</span
              ><span class="switch switch-row"
                ><input type="checkbox" role="switch" :checked="!!r.state.honorific" @change="updateItem(props.slot, { honorific: $event.target.checked || undefined })" /><small
                  >Cubed with a Mark of Infusion: orbs count double, its magic affixes aren't counted</small
                ></span
              ></label
            >
          </div>
        </div>

        <div v-if="r.ranges.length" class="editor-section rolls">
          <h3>
            Rolls
            <button class="text-btn" @click="allRolls(1)">All max</button>
            <button class="text-btn" @click="allRolls(0)">All min</button>
          </h3>
          <label v-for="(x, i) in r.ranges" :key="i" class="roll">
            <span class="roll-line"
              ><template v-for="(part, k) in rollParts(i)" :key="k"
                ><b v-if="part.mine" class="roll-value">{{ part.text }}</b
                ><template v-else>{{ part.text }}</template></template
              ><small>{{ Math.min(x.min, x.max) }}–{{ Math.max(x.min, x.max) }}</small></span
            >
            <input
              type="range"
              :min="Math.min(x.min, x.max)"
              :max="Math.max(x.min, x.max)"
              :step="step(x)"
              :value="rollValue(i)"
              @input="setRoll(i, $event.target.value)"
              :aria-label="`${x.line}: ${shown(i)}`"
            />
          </label>
        </div>

        <ItemAffixes v-if="r.def.kind === 'custom'" class="editor-section" :item="r" @update="setAffixes" />

        <div v-if="r.socketCount" class="editor-section sockets">
          <h3>
            Sockets
            <button
              v-if="empty.length && !mercKey"
              class="text-btn"
              title="Best gems, runes or jewels for your build: damage stats and resistances up to the cap"
              @click="fillSockets(slot)"
            >
              Suggest
            </button>
            <button v-if="anyFilled" class="text-btn" @click="clearSockets(slot)">Empty all</button>
          </h3>
          <ul>
            <li v-for="(s, i) in r.def.kind === 'runeword' ? r.def.runes : r.sockets" :key="i">
              <template v-if="r.def.kind === 'runeword'">
                <ItemIcon :src="catalog.images[s]" /><span>{{ s }} rune</span>
              </template>
              <template v-else-if="s">
                <ItemIcon :icon="s.def.icon" :src="s.def.img ? catalog.images[s.def.img] : ''" /><span
                  >{{ s.def.name }}<small>{{ s.lines.join(" · ") }}</small></span
                >
                <button
                  v-if="empty.length"
                  class="text-btn"
                  :title="`Put ${s.def.name} in the ${empty.length} empty socket${empty.length > 1 ? 's' : ''}`"
                  @click="fillEmptySockets(slot, s.def.key)"
                >
                  Fill empty ({{ empty.length }})
                </button>
                <button class="text-btn" @click="openPicker({ mode: 'socket', slot, index: i })">Change</button>
                <button class="text-btn" :aria-label="`Empty socket ${i + 1}`" @click="clearSocket(i)">Empty</button>
              </template>
              <button v-else class="socket-empty" @click="openPicker({ mode: 'socket', slot, index: i })">+ Fill socket {{ i + 1 }}</button>
            </li>
          </ul>
        </div>

        <div class="editor-section sockets orb-editor">
          <h3>Mystic orbs <button v-if="!mercKey && !ethereal" class="text-btn" @click="enhance(slot)">Suggest orbs and sockets</button></h3>
          <p v-if="ethereal" class="muted">Ethereal items can't take mystic orbs. Their empty sockets can still be filled.</p>
          <template v-else>
            <p class="muted orb-meta">
              <span>Required level {{ r.head.reqLevel }} of {{ itemLevel(slot) }}<template v-if="orbMultiplier(r.lines) !== 1"> · orb bonuses ×{{ orbMultiplier(r.lines) }}</template></span>
              <label class="switch"><input type="checkbox" role="switch" v-model="state.includeUniqueOrbs" />Rare unique orbs</label>
            </p>
            <ul v-if="orbGroups.length" class="orb-list">
              <li v-for="g in orbGroups" :key="g.id">
                <span
                  ><b>{{ g.orb.name }}<template v-if="g.n > 1"> ×{{ g.n }}</template></b
                  ><small>{{ g.orb.lines.join(", ") }}{{ g.n > 1 ? " each" : "" }} · +{{ g.orb.reqLevel * g.n }} required level</small></span
                >
                <span class="stepper" role="group" :aria-label="`${g.orb.name} orbs`">
                  <button class="icon-btn" :aria-label="`Remove a ${g.orb.name} orb`" @click="removeOrb(g.id)">−</button>
                  <output>{{ g.n }}</output>
                  <button class="icon-btn" :aria-label="`Add a ${g.orb.name} orb`" :disabled="!canAddOrb(slot, g.id)" @click="addOrb(slot, g.id)">+</button>
                </span>
              </li>
            </ul>
            <select class="add-select" aria-label="Add a mystic orb" @change="chooseOrb">
              <option value="">+ Add a mystic orb…</option>
              <option v-for="o in availableOrbs" :key="o.id" :value="o.id" :disabled="!canAddOrb(slot, o.id)">{{ o.name }}: {{ o.lines.join(", ") }} (+{{ o.reqLevel }} levels)</option>
            </select>
          </template>
        </div>

        <ItemBonuses v-if="!mercKey" class="editor-section" :item="r" :addons="item.addons || []" @update="setAddons" />
      </div>
    </div>
  </section>
</template>
