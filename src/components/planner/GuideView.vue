<script setup>
// A build as a guide to read (the planner's Guide tab): its author's overview (summary, ratings,
// strengths and weaknesses), then the gear, skills, attributes and key numbers of the stage
// shown, and the mercenary. Read-only: "Open in planner" goes to the editor. A shared or
// community build opens here (usePlanner importFromHash); on the player's own build it's a
// preview of what others will see, with Edit guide.
import { computed } from "vue";
import Icon from "../AppIcon.vue";
import ItemIcon from "./ItemIcon.vue";
import SkillIcon from "./SkillIcon.vue";
import { usePlanner, AUTHOR_TIERS } from "../../planner/usePlanner.js";
import { SLOTS } from "../../planner/items.js";
import { MERC_SLOTS } from "../../planner/mercs.js";
import { activeSlots, ATTRIBUTES } from "../../planner/character.js";
import { superiorNames } from "../../planner/superior.js";

const emit = defineEmits(["edit"]);
const { state, build, character, catalog, engine, allocated, skillsInUse, tipOn, game } = usePlanner();

// Yours unless it was opened from someone else's link and not saved since.
const own = computed(() => !state.opened[state.cls] || !!state.mine[state.cls]);
const name = computed(() => state.openedName[state.cls] || `${state.cls} build`);
const guide = computed(() => state.guides[state.cls] || null);
const portrait = (cls) => {
  const p = { Amazon: "ama", Assassin: "ass", Barbarian: "bar", Druid: "dru", Necromancer: "nec", Paladin: "pal", Sorceress: "sor" }[cls];
  return p ? `${import.meta.env.BASE_URL}planner/portraits/${p}.gif?v=${__BUILD_ID__}` : "";
};

// The author's tiers as bars: S fills it, F a sixth.
const RATINGS = [["tier", "Overall"], ["bossTier", "Bossing"], ["clearTier", "Clearing"], ["surviveTier", "Survival"]];
const ratings = computed(() =>
  RATINGS.map(([k, label]) => ({ k, label, t: build.value.authorTiers?.[k] || "" }))
    .filter((r) => r.t)
    .map((r) => ({ ...r, pct: Math.round(((AUTHOR_TIERS.length - AUTHOR_TIERS.indexOf(r.t)) / AUTHOR_TIERS.length) * 100) })),
);

// Worn gear: the active weapon set and armour, in the paper doll's order.
const gear = computed(() =>
  activeSlots(build.value)
    .map((slot) => {
      const r = character.value.equipped[slot] || (build.value.gear[slot] && catalog.resolve(build.value.gear[slot], build.value.level));
      return r && { slot, label: SLOTS.find((s) => s.id === slot)?.label || slot, r, name: superiorNames(r).name };
    })
    .filter(Boolean),
);
const charms = computed(() => (build.value.inventory || []).map((x) => ({ x, r: catalog.resolve(x, build.value.level) })).filter((c) => c.r));

// Skills with points, most first; the ones in the left and right slots marked.
const skills = computed(() => [...allocated.value].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)));
const fmt = (n) => Math.round(n).toLocaleString();
const damage = computed(() => skillsInUse.value.filter((d) => d.total));

const attrs = computed(() => ATTRIBUTES.map((a) => ({ a, label: a[0].toUpperCase() + a.slice(1), total: character.value.attributes[a].total, spent: build.value.attrs[a] || 0 })));
const resists = computed(() => [
  ["Fire", "fire"],
  ["Cold", "cold"],
  ["Lightning", "lightning"],
  ["Poison", "poison"],
].map(([label, el]) => ({ label, el, value: character.value.resist[el]?.value ?? 0 })));

const merc = computed(() => {
  const m = build.value.merc;
  if (!m) return null;
  const items = MERC_SLOTS.map((s) => m.gear?.[s.id] && { label: s.label, r: catalog.resolve(m.gear[s.id], character.value.merc?.level || build.value.level), item: m.gear[s.id] }).filter((x) => x?.r);
  return { spec: m.spec, level: character.value.merc?.level, items };
});
</script>

<template>
  <article class="guide" aria-labelledby="guide-title">
    <header class="guide-head">
      <img v-if="portrait(state.cls)" class="guide-portrait" :src="portrait(state.cls)" alt="" />
      <div class="guide-title">
        <p class="guide-eyebrow">{{ state.cls }} · Level {{ build.level }} · {{ build.difficulty }} · {{ state.stage[state.cls] }}</p>
        <h2 id="guide-title">{{ name }}</h2>
        <p class="guide-meta">{{ own ? "Your build. This is how others see it when you share it." : state.kept[state.cls] ? "A shared build. Your own is kept aside." : "A shared build." }}<template v-if="game?.patch"> Median XL {{ game.patch }}.</template></p>
      </div>
      <div class="guide-actions">
        <button v-if="own" type="button" class="btn" @click="emit('edit')"><Icon name="pencil" />{{ guide ? "Edit guide" : "Write a guide" }}</button>
        <button type="button" class="btn gold" @click="state.view = 'character'">{{ own ? "Edit in planner" : "Open in planner" }}</button>
      </div>
    </header>

    <section class="guide-overview" aria-label="Overview">
      <div class="guide-about">
        <p v-if="guide?.summary" class="guide-summary">{{ guide.summary }}</p>
        <p v-else class="guide-empty">
          <template v-if="own">No guide yet. Say how the build plays and what it's good at, so others know what they're opening.</template>
          <template v-else>Its author hasn't written a guide. Its gear, skills and stats are below.</template>
        </p>
        <div v-if="guide?.pros.length || guide?.cons.length" class="guide-pc">
          <div v-if="guide.pros.length">
            <h3>Strengths</h3>
            <ul class="guide-list pros">
              <li v-for="p in guide.pros" :key="p"><Icon name="check" />{{ p }}</li>
            </ul>
          </div>
          <div v-if="guide.cons.length">
            <h3>Weaknesses</h3>
            <ul class="guide-list cons">
              <li v-for="c in guide.cons" :key="c"><Icon name="close" />{{ c }}</li>
            </ul>
          </div>
        </div>
      </div>
      <aside v-if="ratings.length" class="guide-ratings" aria-label="The author's ratings">
        <h3>Ratings</h3>
        <div v-for="r in ratings" :key="r.k" class="guide-rating">
          <span>{{ r.label }}</span>
          <span class="guide-bar" aria-hidden="true"><i :class="'tier-' + r.t" :style="{ width: r.pct + '%' }"></i></span>
          <b :class="'tier-' + r.t" :aria-label="`${r.label}: tier ${r.t}`">{{ r.t }}</b>
        </div>
      </aside>
    </section>

    <div class="guide-grid">
      <section class="guide-card" aria-labelledby="guide-gear">
        <h3 id="guide-gear">Gear</h3>
        <ul v-if="gear.length" class="guide-items">
          <li v-for="g in gear" :key="g.slot" tabindex="0" v-on="tipOn({ kind: 'item', item: build.gear[g.slot] })">
            <ItemIcon :icon="g.r.def.icon" />
            <span><b :class="'q-' + g.r.def.kind">{{ g.name }}</b><small>{{ g.label }}<template v-if="g.r.def.base && g.r.def.base !== g.name"> · {{ g.r.def.base }}</template></small></span>
          </li>
        </ul>
        <p v-else class="guide-empty">No gear on this stage.</p>
        <template v-if="charms.length">
          <h4>Charms &amp; relics</h4>
          <ul class="guide-items compact">
            <li v-for="(c, i) in charms" :key="i" tabindex="0" v-on="tipOn({ kind: 'item', item: c.x })">
              <ItemIcon :icon="c.r.def.icon" /><span><b :class="'q-' + c.r.def.kind">{{ c.r.def.name }}</b></span>
            </li>
          </ul>
        </template>
      </section>

      <section class="guide-card" aria-labelledby="guide-skills">
        <h3 id="guide-skills">Skills</h3>
        <ul v-if="skills.length" class="guide-skills">
          <li v-for="s in skills" :key="s.id" tabindex="0" v-on="tipOn({ kind: 'skill', id: s.id })">
            <SkillIcon :image="s.image" />
            <span><b>{{ s.name }}</b><small>{{ s.tree }}<template v-if="build.leftSkill === s.id"> · left skill</template><template v-if="build.rightSkill === s.id"> · right skill</template></small></span>
            <em>{{ s.points }}</em>
          </li>
        </ul>
        <p v-else class="guide-empty">No skill points on this stage.</p>
        <template v-if="damage.length">
          <h4>Damage <span class="est">est.</span></h4>
          <dl class="guide-numbers">
            <div v-for="d in damage" :key="d.id"><dt>{{ d.name }}</dt><dd>{{ fmt((d.vs || d).total[0]) }}–{{ fmt((d.vs || d).total[1]) }}</dd></div>
          </dl>
        </template>
      </section>

      <section class="guide-card" aria-labelledby="guide-stats">
        <h3 id="guide-stats">Attributes &amp; stats</h3>
        <dl class="guide-numbers">
          <div v-for="a in attrs" :key="a.a"><dt>{{ a.label }}</dt><dd>{{ fmt(a.total) }}<small v-if="a.spent"> · {{ a.spent }} spent</small></dd></div>
          <div><dt>Life</dt><dd>{{ fmt(character.life.total) }}</dd></div>
          <div><dt>Mana</dt><dd>{{ fmt(character.mana.total) }}</dd></div>
        </dl>
        <h4>Resistances <small class="muted">({{ build.difficulty }})</small></h4>
        <dl class="guide-numbers guide-resists">
          <div v-for="r in resists" :key="r.el"><dt :class="'el-' + r.el">{{ r.label }}</dt><dd :class="{ bad: r.value < 0 }">{{ r.value }}%</dd></div>
        </dl>
      </section>

      <section v-if="merc" class="guide-card" aria-labelledby="guide-merc">
        <h3 id="guide-merc">Mercenary</h3>
        <p class="guide-merc-name">{{ merc.spec }}<small v-if="merc.level"> · level {{ merc.level }}</small></p>
        <ul v-if="merc.items.length" class="guide-items compact">
          <li v-for="m in merc.items" :key="m.label" tabindex="0" v-on="tipOn({ kind: 'item', item: m.item })">
            <ItemIcon :icon="m.r.def.icon" /><span><b :class="'q-' + m.r.def.kind">{{ m.r.def.name }}</b><small>{{ m.label }}</small></span>
          </li>
        </ul>
        <p v-else class="guide-empty">No gear.</p>
      </section>
    </div>
  </article>
</template>
