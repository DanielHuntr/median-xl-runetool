<script setup>
// The Mercenary tab: laid out like the in-game mercenary screen (its gear on the paper doll,
// its skills with their levels, its stats), plus the buffs it casts on you, which count
// toward your stats (src/planner/mercs.js).
import { computed } from "vue";
import Icon from "../AppIcon.vue";
import ItemIcon from "./ItemIcon.vue";
import SkillIcon from "./SkillIcon.vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { MERC_ACTS, MERC_SLOTS, MERC_CLASS_ITEMS, mercCats } from "../../planner/mercs.js";

const { planner, catalog, build, character, openPicker, openEditor, removeMercItem, toggleMercBuff, tipOn, suggestMerc } = usePlanner();
// A filled slot opens the item editor (tier, sockets, orbs); an empty one the picker.
const openSlot = (id) => (build.value.merc?.gear?.[id] ? openEditor(`merc:${id}`) : openPicker({ mode: "merc", slot: id }));
const m = computed(() => character.value.merc);
const cells = computed(() => (m.value ? MERC_SLOTS.filter((s) => mercCats(m.value.act, s.id)) : []));
const itemOf = (slot) => {
  const st = build.value.merc?.gear?.[slot];
  return st ? catalog.resolve(st, m.value.level) : null;
};
// Mercenary skills share their names and art with player skills where there is one.
const imageOf = (name) => Object.values(planner.skills || {}).find((s) => s.name === name)?.image || "";
const fmt = (n) => Math.round(n).toLocaleString();
const statName = (key) => planner.stats?.[key]?.name || key.replace(/_/g, " ");
const PCT = /speed|chance|spell_damage|weapon_damage|enhanced_damage/;
const effectText = ([key, v]) => `${v > 0 ? "+" : ""}${fmt(v)}${PCT.test(key) ? "%" : ""} ${statName(key)}`;
const RES = [["fire", "Fire"], ["cold", "Cold"], ["lightning", "Lightning"], ["poison", "Poison"]];
</script>
<template>
  <section class="merc-view" aria-label="Mercenary">
    <div v-if="!m" class="merc-empty">
      <p>No mercenary hired. Choose one above to plan its gear, see its stats and skills, and count the buffs it casts on you.</p>
    </div>
    <template v-else>
      <div class="merc-layout">
        <section class="doll-panel merc-doll-panel" aria-label="Mercenary's equipment">
          <div class="doll-top">
            <h2 class="group-title">{{ m.spec }} <small class="muted">{{ MERC_ACTS[m.act].name }}</small></h2>
            <button class="btn suggest-btn" title="Pick its gear: +All Skills first (a stronger buff), then life, resistances and defense" @click="suggestMerc"><Icon name="star" />Suggest gear</button>
          </div>
          <div class="doll merc-doll">
            <div v-for="s in cells" :key="s.id" class="doll-cell" :class="s.id" :style="{ gridArea: s.id }">
              <button
                class="doll-slot"
                :class="[s.id, { filled: itemOf(s.id) }]"
                :aria-label="itemOf(s.id) ? `Mercenary's ${s.label.toLowerCase()}: ${itemOf(s.id).def.name}. Select to edit` : `Mercenary's ${s.label.toLowerCase()}: empty, choose an item`"
                v-on="itemOf(s.id) ? tipOn({ kind: 'item', item: build.merc.gear[s.id] }) : {}"
                @click="openSlot(s.id)"
              >
                <template v-if="itemOf(s.id)">
                  <ItemIcon :icon="itemOf(s.id).def.icon" />
                  <span class="doll-name" :class="'q-' + itemOf(s.id).def.kind">{{ itemOf(s.id).def.name }}</span>
                </template>
                <span v-else class="doll-empty">{{ s.label }}</span>
              </button>
              <button v-if="itemOf(s.id)" class="doll-remove" :aria-label="`Remove ${itemOf(s.id).def.name}`" title="Remove" @click="removeMercItem(s.id)"><Icon name="close" /></button>
            </div>
          </div>
          <p class="muted merc-note">Can also wear {{ MERC_CLASS_ITEMS[m.act] }} (the docs). The off-hand taking shields is assumed.</p>
        </section>

        <section class="merc-side" aria-label="Mercenary's skills and stats">
          <ul class="merc-skill-row" aria-label="Skills">
            <li v-for="s in m.skills" :key="s.name" :title="s.docsName">
              <SkillIcon v-if="imageOf(s.name) || imageOf(s.docsName)" :image="imageOf(s.name) || imageOf(s.docsName)" />
              <span v-else class="merc-skill-mark" aria-hidden="true">{{ s.docsName[0] }}</span>
              <b>{{ s.level }}</b>
              <small>{{ s.docsName }}</small>
            </li>
          </ul>
          <div class="merc-stats">
            <dl>
              <div><dt>Level</dt><dd>{{ m.level }}</dd></div>
              <div><dt>Strength</dt><dd>{{ fmt(m.strength) }}</dd></div>
              <div><dt>Dexterity</dt><dd>{{ fmt(m.dexterity) }}</dd></div>
              <div><dt>Life</dt><dd>{{ fmt(m.life) }}</dd></div>
              <div><dt>Defense</dt><dd>{{ fmt(m.defense) }}</dd></div>
              <div><dt>Attack rating</dt><dd>{{ fmt(m.ar) }}</dd></div>
              <div><dt>{{ m.damage.weapon ? "Weapon damage" : "Damage" }}</dt><dd>{{ fmt(m.damage.range[0]) }}–{{ fmt(m.damage.range[1]) }}</dd></div>
            </dl>
            <dl>
              <div v-for="[k, n] in RES" :key="k"><dt :class="'el-' + k">{{ n }} resistance</dt><dd>{{ Math.min(m.resist[k].stacked, m.resist[k].max) }}%</dd></div>
              <div><dt>Physical resistance</dt><dd>{{ m.resist.physical }}%</dd></div>
              <div v-for="[k, v] in m.extras" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></div>
              <div v-if="m.allSkills"><dt>All skills from gear</dt><dd>+{{ m.allSkills }}</dd></div>
            </dl>
          </div>
          <div v-if="m.skills.some((s) => s.buff)" class="merc-buffs">
            <h3>Buffs on you</h3>
            <div v-for="s in m.skills.filter((x) => x.buff)" :key="s.name" class="merc-buff">
              <label class="switch"><input type="checkbox" :checked="s.on" @change="toggleMercBuff(s.name)" />{{ s.docsName }} (level {{ s.level }})</label>
              <p v-if="s.effects.length" class="merc-effects">{{ s.effects.map(effectText).join(" · ") }}</p>
              <p v-for="u in s.uncounted" :key="u" class="muted merc-note">Not counted: {{ u }}</p>
              <p v-if="s.tooltip.length" class="muted merc-note">In game, its tooltip should read: {{ s.tooltip.join(" · ") }}. A screenshot of it confirms these values.</p>
            </div>
          </div>
          <p class="muted merc-note">
            Estimates. Base stats and skills from the game (hireling.bin), growing by level as Diablo II's hireling rules, checked against an
            in-game level 44 Town Guard; bonuses as the <a href="https://docs.median-xl.com/doc/class/hirelings" target="_blank" rel="noopener">docs</a> give them.
            Buff values come from the skills' own game formulas and aren't checked in game yet.
          </p>
        </section>
      </div>
    </template>
  </section>
</template>
<style scoped>
.merc-empty { padding: 28px; border: 1px dashed var(--border); border-radius: 6px; color: var(--muted); text-align: center; }
.merc-layout { display: grid; grid-template-columns: minmax(300px, 1fr) minmax(0, 1.4fr); gap: 18px; align-items: start; }
.merc-doll-panel .group-title small { font-family: Inter, sans-serif; font-size: 0.75rem; letter-spacing: 0; text-transform: none; margin-left: 6px; }
.merc-side { display: grid; gap: 16px; padding: 18px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); }
.merc-skill-row { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 12px; }
.merc-skill-row li { display: grid; justify-items: center; gap: 2px; width: 76px; text-align: center; }
.merc-skill-mark { display: grid; place-items: center; width: 48px; height: 48px; border: 1px solid var(--border); border-radius: 4px; background: var(--field); color: var(--gold); font-family: var(--serif); font-size: 1.4rem; }
.merc-skill-row b { font-size: 0.9375rem; color: var(--good); }
.merc-skill-row small { color: var(--muted); font-size: 0.75rem; line-height: 1.2; }
.merc-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 22px; }
.merc-stats dl { margin: 0; display: grid; gap: 4px; align-content: start; }
.merc-stats div { display: flex; justify-content: space-between; gap: 10px; padding: 5px 10px; border: 1px solid var(--soft-border); border-radius: 4px; background: var(--field); font-size: 0.8125rem; }
.merc-stats dt { color: var(--muted); }
.merc-stats dd { margin: 0; font-weight: 500; }
.merc-buffs { display: grid; gap: 8px; }
.merc-buffs h3 { margin: 0; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; }
.merc-buff .switch { font-size: 0.875rem; }
.merc-effects { margin: 4px 0 0; color: var(--good); font-size: 0.8125rem; line-height: 1.45; }
.merc-note { margin: 0; font-size: 0.75rem; line-height: 1.5; }
@media (max-width: 900px) {
  .merc-layout, .merc-stats { grid-template-columns: minmax(0, 1fr); }
}
</style>
