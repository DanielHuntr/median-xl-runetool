<script setup>
import { computed, ref, shallowRef, watch } from 'vue';
import { useSavedBuilds, MAX_NAME } from '../planner/savedBuilds.js';
import { encodeBuild, decodeBuild, plannerHash } from '../planner/buildCode.js';
import presets from '../data/preset-builds.json';
import ClassPicker from './ClassPicker.vue';
import SkillIcon from './planner/SkillIcon.vue';
import Icon from './AppIcon.vue';
import { tierWhy, fieldOf } from '../planner/tierWhy.js';
const { builds, rename, remove } = useSavedBuilds();
const classes = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];
const cls = ref(''), tier = ref(''), query = ref(''), editing = ref(null), name = ref(''), deleting = ref(null), error = ref('');
const matches = b => (!cls.value || b.cls === cls.value) && `${b.name} ${b.cls} ${b.tree || ''} ${(b.skills || []).join(' ')}`.toLowerCase().includes(query.value.trim().toLowerCase());
const saved = computed(() => builds.value.filter(matches));
// A saved build's own tier (its author's, inside the build) and what the estimate compared it with.
const authorTierOf = (b) => { const t = decodeBuild(b.code)?.authorTier; return /^[SABCDF]$/.test(t || '') ? t : ''; };
const estimateNote = (e) => `Bossing ${e.bossTier ?? '?'} · Clearing ${e.clearTier ?? '?'} · Survival ${e.surviveTier ?? '?'}, estimated among the starter builds at ${e.against?.level === 150 ? 'endgame' : `level ${e.against?.level ?? '?'} · ${e.against?.difficulty ?? ''}`} when saved`;
// Tiers (src/planner/rating.js): S best to F, against the other starter builds; summon
// builds aren't rated.
const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'F'];
// What a card shows: the endgame build, or the selected levelling stage, each with its own
// tier (rated among the builds at the same stage), card summary and build (rate-presets.mjs).
const viewOf = (b) => {
  const s = stageOf(b);
  return s ? { level: s.level, difficulty: s.difficulty, rating: s.rating || null, summary: s.summary || null, build: s.build }
    : { level: b.build.level, difficulty: 'Hell', rating: b.summary?.rating || null, summary: b.summary || null, build: b.build };
};
const ratingOf = (b) => viewOf(b).rating;
// Which stage the cards show: the endgame build, or a levelling stage from its guide
// (preset-stages.json, loaded when first asked for), the same ones the planner opens as its
// Normal, Nightmare and Hell stages.
const STAGE_LEVEL = { Normal: 50, Nightmare: 100, Hell: 125 };
const stage = ref('Endgame');
const stageGuides = shallowRef(null);
watch(stage, async (s) => {
  if (s !== 'Endgame' && !stageGuides.value) stageGuides.value = (await import('../data/preset-stages.json')).default.stages || {};
});
const stageOf = (b) => (stage.value === 'Endgame' ? null : stageGuides.value?.[b.id]?.find((x) => x.level === STAGE_LEVEL[stage.value] && x.build) || null);
const endgame = computed(() => stage.value === 'Endgame');
const tierOf = (b) => ratingOf(b)?.tier || '';
const tierRank = (b) => (tierOf(b) ? TIER_ORDER.indexOf(tierOf(b)) : TIER_ORDER.length);
const starters = computed(() => presets.presets.filter((b) => matches(b) && (!tier.value || (tier.value === 'unrated' ? !tierOf(b) : tierOf(b) === tier.value))));
// The numbers behind a tier: bossing (one monster at a time), clearing (packs, estimated from
// each skill's reach), effective life, and how much of its casting it can pay for in mana.
const tierNote = (r) => r?.tier
  ? `#${r.rank} of ${r.of} · ~${fmt(r.boss ?? r.dps)} bossing, ~${fmt(r.clear ?? r.dps)} clearing damage/s · ${fmt(r.ehp)} effective life${r.sustain != null && r.sustain < 100 ? ` · mana for ${r.sustain}% of its casting` : ''}`
  : r?.unrated || '';
const CRITERIA = [['bossTier', 'Bossing'], ['clearTier', 'Clearing'], ['surviveTier', 'Survival']];
// What it's best at and what holds it back, against the typical starter build (tierWhy.js).
const field = computed(() => fieldOf(presets.presets.map(ratingOf)));
const why = (b) => tierWhy(ratingOf(b), field.value);
// Starter builds grouped by class (in the class list's order), each class's by tree.
const starterGroups = computed(() => classes.map((c) => ({ cls: c, builds: starters.value.filter((b) => b.cls === c)
  .sort((a, b) => tierRank(a) - tierRank(b) || (ratingOf(a)?.rank ?? 0) - (ratingOf(b)?.rank ?? 0) || a.name.localeCompare(b.name)) })).filter((g) => g.builds.length));
// Each class's card art (public/builds/<class>.webp).
const art = (cls) => `${import.meta.env.BASE_URL}builds/${cls.toLowerCase()}.webp`;
const fmt = (n) => Math.round(n).toLocaleString();
const SLOT_BADGE = { 'Left skill': 'L', 'Right skill': 'R' };
// A starter build also brings its levelling stages (&preset=, CharacterPlanner.vue).
const href = (b, preset = false) => `#${plannerHash(preset ? encodeBuild(b.build) : b.code)}&name=${encodeURIComponent(b.name)}${preset ? `&preset=${b.id}` : ""}${preset && !endgame.value ? `&stage=${stage.value}` : ""}`;
function commitRename(id) {
  const result = rename(id, name.value);
  error.value = result.ok ? '' : result.reason;
  if (result.ok) editing.value = null;
}
function deleteBuild(id) {
  if (remove(id)) { deleting.value = null; error.value = ''; }
  else error.value = 'Your browser could not delete this build. Please try again.';
}
</script>
<template>
  <section class="build-library">
    <div class="build-filters">
      <ClassPicker v-model="cls" :classes="classes" any-label="All classes" />
      <label class="field">Search builds<input v-model="query" type="search" placeholder="Name or skill" /></label>
      <label class="field tier-field">Stage<select v-model="stage">
        <option value="Endgame">Endgame</option>
        <option value="Normal">Normal</option>
        <option value="Nightmare">Nightmare</option>
        <option value="Hell">Hell</option>
      </select></label>
      <label class="field tier-field">Starter tier<select v-model="tier">
        <option value="">Any tier</option>
        <option v-for="t in TIER_ORDER" :key="t" :value="t">Tier {{ t }}</option>
        <option value="unrated">Unrated (summons)</option>
      </select></label>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <!-- The player's own builds: set apart from the starter builds below. -->
    <section class="mine-section" aria-labelledby="mine-title">
    <h2 id="mine-title" class="mine-title">Your saved builds <span class="mine-count">{{ builds.length }}</span></h2>
    <p class="muted">Saved in this browser with Save build in the planner. Opening one keeps your current build for that class aside, to go back to.</p>
    <p v-if="!saved.length" class="mine-empty">{{ builds.length ? 'None of your saved builds match these filters.' : "You haven’t saved a build yet. Use Save build in the Character Planner and it will appear here." }}</p>
    <div class="build-grid">
      <article v-for="b in saved" :key="b.id" class="build-card mine">
        <div class="build-art" aria-hidden="true"><img :src="art(b.cls)" alt="" loading="lazy" /></div>
        <h3>{{ b.name }}</h3>
        <p>{{ b.cls }} · Level {{ b.level ?? 'unknown' }}</p>
        <!-- The author's own tier (in the build) and the planner's estimate when it was saved. -->
        <p v-if="authorTierOf(b) || b.estimate" class="tier-criteria mine-tiers">
          <span v-if="authorTierOf(b)" :class="`tier-chip tier-${authorTierOf(b)}`">Your tier {{ authorTierOf(b) }}</span>
          <span v-if="b.estimate" :class="`tier-chip tier-${b.estimate.tier}`" :title="estimateNote(b.estimate)">Estimate {{ b.estimate.tier }}</span>
        </p>
        <p v-if="b.skills.length" class="muted">{{ b.skills.join(' · ') }}</p>
        <p v-if="b.savedAt" class="mine-edited">Last edited {{ new Date(b.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) }}</p>
        <form v-if="editing === b.id" class="build-actions" @submit.prevent="commitRename(b.id)">
          <label class="field">Build name<input v-model="name" :maxlength="MAX_NAME" required /></label>
          <button class="btn gold">Save name</button><button type="button" class="btn" @click="editing = null">Cancel</button>
        </form>
        <div v-else-if="deleting === b.id" class="build-actions">
          <p>Delete this saved snapshot?</p><button class="btn" @click="deleteBuild(b.id)">Delete snapshot</button><button class="btn" @click="deleting = null">Cancel</button>
        </div>
        <div v-else class="build-actions">
          <a class="btn gold" :href="href(b)">Open build</a>
          <button class="btn" @click="editing = b.id; name = b.name; error = ''">Rename</button>
          <button class="btn" @click="deleting = b.id">Delete</button>
        </div>
      </article>
    </div>
    </section>
    <h2 class="starter-title">Starter builds</h2>
    <p class="muted">Generated with the planner for patch {{ presets.patch }}. These are starting points, not builds verified in game.
      Tiers, from S (best) to F, compare them with each other on what the community's tier lists weigh: bossing (damage per second to a typical Hell monster, one at a time), clearing (the same on packs, from each skill's reach) and survival (effective life through resistances, avoid and block), with attack and cast speed breakpoints, hit chance, cooldowns and whether it can pay for its casting in mana. Summon builds aren't rated yet. <b>Stage</b>: Endgame shows each build in its best gear; Normal, Nightmare and Hell show its levelling stages (levels 50, 100 and 125), on gear a player finds on the way without trading for the rarest drops (no sacred uniques, high runes, late sets or uber charms). Opening one keeps your current build for that class aside, to go back to. Each opens with its levelling stages (Normal, Nightmare, Hell and Endgame) to switch between in the planner.</p>
    <p v-if="!starters.length" class="muted">No starter builds match these filters.</p>
    <section v-for="g in starterGroups" :key="g.cls" class="starter-group" :aria-label="`${g.cls} starter builds`">
    <h3 class="starter-class">{{ g.cls }} <span class="muted">{{ g.builds.length }}</span></h3>
    <div class="build-grid">
      <div v-for="b in g.builds" :key="b.id" class="starter-wrap">
      <a class="build-card starter-card" :href="href(b, true)">
        <div class="build-art" aria-hidden="true"><img :src="art(b.cls)" alt="" loading="lazy" /></div>
        <h3><span v-if="ratingOf(b)?.tier" class="tier-badge" :class="`tier-${ratingOf(b).tier}`" :aria-label="`Tier ${ratingOf(b).tier}`">{{ ratingOf(b).tier }}</span>{{ b.name }}<span v-if="ratingOf(b)?.unrated" class="tier-unrated" :title="ratingOf(b).unrated">Unrated</span></h3><p>{{ b.cls }} · Level {{ viewOf(b).level }}<template v-if="!endgame"> · {{ viewOf(b).difficulty }}</template><template v-if="b.tree"> · {{ b.tree }} tree</template></p>
        <p v-if="ratingOf(b)?.bossTier" class="tier-criteria"><span v-for="[k, label] in CRITERIA" :key="k" :class="`tier-chip tier-${ratingOf(b)[k]}`">{{ label }} {{ ratingOf(b)[k] }}</span></p>
        <p v-if="why(b)" class="tier-why">{{ why(b) }}<span v-if="ratingOf(b)?.assumed?.length" class="tier-estimate" :title="`Estimate assumes: ${ratingOf(b).assumed.join('; ')}`">Estimate</span></p>
        <!-- Left and right skill, then the skill bar; each shows its tooltip on hover or focus. -->
        <ul v-if="viewOf(b).summary?.icons?.length" class="build-skills" aria-label="Skills">
          <li v-for="(k, i) in viewOf(b).summary.icons" :key="k.id + i" class="build-skill" :aria-describedby="`tip-${b.id}-${i}`">
            <SkillIcon :image="k.image" /><span v-if="SLOT_BADGE[k.slot]" class="build-skill-badge" aria-hidden="true">{{ SLOT_BADGE[k.slot] }}</span>
            <div :id="`tip-${b.id}-${i}`" role="tooltip" class="build-skill-tip">
              <b>{{ k.name }}</b>
              <small>{{ k.slot }} · {{ k.points }}<template v-if="k.soft"> + {{ k.soft }}</template> points<template v-if="k.active"> · switched on</template></small>
              <em v-if="k.description">{{ k.description }}</em>
              <span v-if="k.vs" class="build-skill-dmg">{{ fmt(k.vs) }} {{ k.per }} vs a typical {{ viewOf(b).difficulty }} monster (est.)</span>
              <span v-for="l in k.lines" :key="l">{{ l }}</span>
            </div>
          </li>
        </ul>
        <p v-if="viewOf(b).summary" class="muted">{{ (ratingOf(b)?.life ?? viewOf(b).summary.life).toLocaleString() }} life · {{ (ratingOf(b)?.mana ?? viewOf(b).summary.mana).toLocaleString() }} mana<template v-if="viewOf(b).build.merc?.spec"> · {{ viewOf(b).build.merc.spec }} mercenary</template></p>
      </a>
      <!-- The rest on request: the numbers behind the tier, gear, points and what an estimate assumes. -->
      <details v-if="viewOf(b).summary" class="card-more">
        <summary>Details</summary>
        <p v-if="ratingOf(b)?.tier" class="tier-note">{{ tierNote(ratingOf(b)) }}</p>
        <p v-if="ratingOf(b)?.assumed?.length" class="tier-assumed">Estimate assumes: {{ ratingOf(b).assumed.join('; ') }}</p>
        <p v-if="viewOf(b).summary.gear?.length" class="muted stage-gear">Gear: {{ viewOf(b).summary.gear.join(' · ') }}</p>
        <p v-if="viewOf(b).summary.bar?.length" class="muted">Skill bar: {{ viewOf(b).summary.bar.join(' · ') }}</p>
        <p v-if="viewOf(b).summary.unspent" class="muted">{{ viewOf(b).summary.unspent }} skill points left to customise.</p>
        <p v-else class="muted">All skill points allocated · {{ viewOf(b).build.signets }} Signets of Learning</p>
      </details>
      </div>
    </div>
    </section>
  </section>
</template>
<style scoped>
.build-library { padding: 0 24px 32px; }
.starter-class { margin: 28px 0 0; font-family: var(--serif); color: var(--gold); font-size: 1.25rem; }
.starter-class .muted { font-family: inherit; font-size: .875rem; margin-left: 6px; }
.field { display:flex; flex-direction:column; gap:8px; color:var(--muted); font-size:.8125rem; margin:0; }
.field input { padding:10px 12px; font:inherit; font-size:.875rem; color:var(--text); }
.build-filters, .build-actions { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.build-filters { margin-bottom:28px; align-items:end; }
.build-filters .field { flex:1; min-width:200px; }
/* Two columns however many cards there are (auto-fit stretched a lone card to full width). */
.build-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; margin:20px 0 36px; }
@media (max-width: 760px) { .build-grid { grid-template-columns:minmax(0, 1fr); } }
/* Your saved builds: framed separately, with the same card art treatment as starters. */
.mine-section { margin:0 0 12px; padding:20px 22px 4px; border:1px solid var(--border); border-radius:10px; background:color-mix(in srgb, var(--field) 42%, transparent); }
.mine-title { display:flex; align-items:center; gap:10px; margin:0 0 6px; color:var(--gold); }
.mine-count { padding:1px 9px; border-radius:10px; background:var(--gold-bg); border:1px solid var(--gold); font-size:.8125rem; font-family:inherit; }
.mine-empty { margin:16px 0 20px; padding:16px; border:1px dashed var(--border); border-radius:8px; color:var(--muted); text-align:center; }
.build-card.mine { border-color:color-mix(in srgb, var(--gold) 45%, var(--border)); background:var(--panel); transition:border-color .15s, box-shadow .15s; }
.build-card.mine:hover,
.build-card.mine:focus-within { border-color:var(--gold); box-shadow:0 0 0 1px color-mix(in srgb, var(--gold) 40%, transparent) inset, 0 0 18px color-mix(in srgb, var(--gold) 16%, transparent); }
.mine-edited { margin:4px 0 0; color:var(--muted); font-size:.75rem; }
.starter-title { margin-top:28px; }
/* The class art fills the card's right side. It sits in its own
   clipped layer so the skill tooltips can still reach past the card's edge. */
.build-card { position:relative; padding:24px calc(40% + 8px) 24px 24px; border:1px solid var(--border); border-radius:8px; background:var(--panel); overflow:visible; }
.starter-wrap { position:relative; display:flex; flex-direction:column; }
.starter-wrap .starter-card { flex:1; }
/* Details under a card: joined to its bottom edge. */
.starter-wrap:has(.card-more) .starter-card { border-bottom-left-radius:0; border-bottom-right-radius:0; }
.card-more { border:1px solid var(--border); border-top:0; border-radius:0 0 8px 8px; background:var(--panel); padding:0 24px; font-size:.8125rem; }
.card-more summary { cursor:pointer; padding:8px 0; color:var(--muted); font-size:.75rem; }
.card-more summary:hover, .card-more summary:focus-visible { color:var(--text); }
.card-more[open] { padding-bottom:12px; }
.card-more p { margin:0 0 6px; }
.tier-estimate { margin-left:.5em; padding:0 5px; border:1px solid var(--warn); border-radius:3px; color:var(--warn); font-size:.6875rem; cursor:help; vertical-align:.1em; }
.starter-card { display:block; color:inherit; text-decoration:none; transition:border-color .15s, box-shadow .15s; }
.starter-card:hover,
.starter-card:focus-visible { border-color:var(--gold); box-shadow:0 0 0 1px color-mix(in srgb, var(--gold) 40%, transparent) inset, 0 0 18px color-mix(in srgb, var(--gold) 16%, transparent); outline:none; }
.build-card > :not(.build-art) { position:relative; z-index:1; }
.build-art { position:absolute; inset:0 0 0 auto; width:48%; overflow:hidden; border-radius:0 8px 8px 0; pointer-events:none; }
.build-art::before { content:""; position:absolute; inset:0; z-index:1; background:linear-gradient(90deg, var(--panel), transparent 35%); }
.build-art img { width:calc(100% + 50px); height:100%; object-fit:cover; object-position:center 15%; opacity:.5; filter:grayscale(1); transform:scaleX(-1) translateX(-50px); transform-origin:center; transition:filter .2s, opacity .2s; }
.starter-card:hover .build-art img,
.starter-card:focus-visible .build-art img,
.build-card.mine:hover .build-art img,
.build-card.mine:focus-within .build-art img { filter:grayscale(0); opacity:.65; }
@media (max-width: 520px) { .build-card { padding-right:24px; } .build-art { width:55%; } .build-art img { opacity:.28; } }
.build-card h3 { margin:0 0 12px; }
.tier-field select { padding:10px 12px; font:inherit; font-size:.875rem; color:var(--text); }
.tier-field { flex:0 0 auto !important; min-width:160px !important; }
/* Tier badges: S to F, gold to grey. */
.tier-badge { display:inline-grid; place-items:center; width:1.6em; height:1.6em; margin-right:.5em; border-radius:4px; font-family:var(--serif); font-size:.95em; line-height:1; vertical-align:.08em; border:1px solid currentColor; }
.tier-S { color:#ffb454; background:color-mix(in srgb, #ffb454 16%, transparent); }
.tier-A { color:var(--gold); background:color-mix(in srgb, var(--gold) 14%, transparent); }
.tier-B { color:#7ec27e; background:color-mix(in srgb, #7ec27e 12%, transparent); }
.tier-C { color:#7fa8d8; background:color-mix(in srgb, #7fa8d8 12%, transparent); }
.tier-D { color:#b59ad6; background:color-mix(in srgb, #b59ad6 12%, transparent); }
.tier-F { color:var(--muted); background:color-mix(in srgb, var(--muted) 12%, transparent); }
:global(:root[data-theme="light"]) .tier-S { color:#a35300; }
:global(:root[data-theme="light"]) .tier-B { color:#2f7a2f; }
:global(:root[data-theme="light"]) .tier-C { color:#2d5f9a; }
:global(:root[data-theme="light"]) .tier-D { color:#6b479a; }
.tier-unrated { margin-left:.6em; padding:1px 6px; border:1px solid var(--border); border-radius:4px; font:500 .6875rem/1.4 Inter, sans-serif; color:var(--muted); vertical-align:.2em; }
.tier-criteria { display:flex; flex-wrap:wrap; gap:4px; margin:-4px 0 6px; }
.tier-chip { padding:0 6px; border:1px solid currentColor; border-radius:3px; font:500 .6875rem/1.5 Inter, sans-serif; background:transparent !important; }
.tier-note { font-size:.75rem; color:var(--muted); margin:-6px 0 8px; }
.tier-why { font-size:.8125rem; margin:-2px 0 8px; }
.tier-assumed { font-size:.75rem; color:var(--warn); margin:-4px 0 8px; }
.build-card p { line-height:1.6; }
.build-actions { margin-top:20px; }
.build-skills { list-style:none; display:flex; flex-wrap:wrap; gap:6px; padding:0; margin:12px 0 4px; }
.build-skill { position:relative; outline:none; border-radius:4px; }
/* Icons stay 48px: the sprite position is set in 48px cells (SkillIcon.vue). */
.build-skill:focus-visible { box-shadow:0 0 0 2px var(--gold); }
.build-skill-badge { position:absolute; left:-4px; top:-4px; font-size:.625rem; font-weight:700; line-height:1; padding:2px 4px; border-radius:3px; background:var(--gold-bg); color:var(--gold); border:1px solid var(--border); }
.build-skill-tip { display:none; position:absolute; z-index:5; bottom:calc(100% + 8px); left:0; width:min(300px, 80vw); padding:12px; border:1px solid var(--border); border-radius:6px; background:var(--raised); box-shadow:0 6px 24px var(--shade); font-size:.8125rem; line-height:1.5; color:var(--text); flex-direction:column; gap:2px; text-align:left; }
.build-skill:hover .build-skill-tip, .build-skill:focus-visible .build-skill-tip { display:flex; }
.build-skill-tip b { color:var(--gold); font-family:var(--serif); font-size:1rem; }
.build-skill-tip small { color:var(--muted); }
.build-skill-tip em { color:var(--muted); margin:4px 0; }
.build-skill-dmg { color:var(--good); }
.build-actions p { flex-basis:100%; margin:0; }
.build-actions .field { flex-basis:100%; }
.build-actions a { text-decoration:none; }
@media(max-width:600px) { .build-library { padding:0 12px 24px; } }
</style>
