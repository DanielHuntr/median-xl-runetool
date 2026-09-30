<script setup>
import { computed, ref } from 'vue';
import { useSavedBuilds, MAX_NAME } from '../planner/savedBuilds.js';
import { decodeBuild, plannerHash } from '../planner/buildCode.js';
import ClassPicker from './ClassPicker.vue';
const { builds, rename, remove } = useSavedBuilds();
const classes = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];
const cls = ref(''), query = ref(''), editing = ref(null), name = ref(''), deleting = ref(null), error = ref('');
const matches = b => (!cls.value || b.cls === cls.value) && `${b.name} ${b.cls} ${(b.skills || []).join(' ')}`.toLowerCase().includes(query.value.trim().toLowerCase());
const saved = computed(() => builds.value.filter(matches));
// A saved build's tiers as its author gave them (inside the build): overall and per criterion.
const authorTiersOf = (b) => {
  const t = decodeBuild(b.code)?.authorTiers || {};
  return Object.fromEntries(['tier', 'bossTier', 'clearTier', 'surviveTier'].filter((k) => /^[SABCDF]$/.test(t[k] || '')).map((k) => [k, t[k]]));
};
const CRITERIA = [['bossTier', 'Bossing'], ['clearTier', 'Clearing'], ['surviveTier', 'Survival']];
// Each class's card art (public/builds/<class>.webp).
const art = (cls) => `${import.meta.env.BASE_URL}builds/${cls.toLowerCase()}.webp`;
const href = (b) => `#${plannerHash(b.code)}&name=${encodeURIComponent(b.name)}&mine=1`;
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
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <section class="mine-section" aria-labelledby="mine-title">
    <h2 id="mine-title" class="mine-title">Your saved builds <span class="mine-count">{{ builds.length }}</span></h2>
    <p class="muted">Saved in this browser with Save build in the planner. Opening one keeps your current build for that class aside, to go back to.</p>
    <p v-if="!saved.length" class="mine-empty">{{ builds.length ? 'None of your saved builds match these filters.' : "You haven’t saved a build yet. Use Save build in the Character Planner and it will appear here." }}</p>
    <div class="build-grid">
      <article v-for="b in saved" :key="b.id" class="build-card mine">
        <div class="build-art" aria-hidden="true"><img :src="art(b.cls)" alt="" loading="lazy" /></div>
        <!-- The tiers its author gave it (inside the build). -->
        <h3><span v-if="authorTiersOf(b).tier" class="tier-badge" :class="`tier-${authorTiersOf(b).tier}`" :aria-label="`Tier ${authorTiersOf(b).tier}`">{{ authorTiersOf(b).tier }}</span>{{ b.name }}</h3>
        <p>{{ b.cls }} · Level {{ b.level ?? 'unknown' }}</p>
        <p v-if="CRITERIA.some(([k]) => authorTiersOf(b)[k])" class="tier-criteria mine-tiers">
          <template v-for="[k, label] in CRITERIA" :key="k"><span v-if="authorTiersOf(b)[k]" :class="`tier-chip tier-${authorTiersOf(b)[k]}`">{{ label }} {{ authorTiersOf(b)[k] }}</span></template>
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
    <p class="muted share-note">Share a build with Share build in the planner: the link opens it, with the tiers you gave it, for anyone.</p>
  </section>
</template>
<style scoped>
.build-library { padding: 0 24px 32px; }
.field { display:flex; flex-direction:column; gap:8px; color:var(--muted); font-size:.8125rem; margin:0; }
.field input { padding:10px 12px; font:inherit; font-size:.875rem; color:var(--text); }
.build-filters, .build-actions { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.build-filters { margin-bottom:28px; align-items:end; }
.build-filters .field { flex:1; min-width:200px; }
/* Two columns however many cards there are (auto-fit stretched a lone card to full width). */
.build-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; margin:20px 0 36px; }
@media (max-width: 760px) { .build-grid { grid-template-columns:minmax(0, 1fr); } }
.mine-section { margin:0 0 12px; padding:20px 22px 4px; border:1px solid var(--border); border-radius:10px; background:color-mix(in srgb, var(--field) 42%, transparent); }
.mine-title { display:flex; align-items:center; gap:10px; margin:0 0 6px; color:var(--gold); }
.mine-count { padding:1px 9px; border-radius:10px; background:var(--gold-bg); border:1px solid var(--gold); font-size:.8125rem; font-family:inherit; }
.mine-empty { margin:16px 0 20px; padding:16px; border:1px dashed var(--border); border-radius:8px; color:var(--muted); text-align:center; }
.share-note { margin:16px 0 0; }
.build-card { position:relative; padding:24px calc(40% + 8px) 24px 24px; border:1px solid var(--border); border-radius:8px; background:var(--panel); overflow:visible; }
.build-card.mine { border-color:color-mix(in srgb, var(--gold) 45%, var(--border)); transition:border-color .15s, box-shadow .15s; }
.build-card.mine:hover,
.build-card.mine:focus-within { border-color:var(--gold); box-shadow:0 0 0 1px color-mix(in srgb, var(--gold) 40%, transparent) inset, 0 0 18px color-mix(in srgb, var(--gold) 16%, transparent); }
.mine-edited { margin:4px 0 0; color:var(--muted); font-size:.75rem; }
.build-card > :not(.build-art) { position:relative; z-index:1; }
.build-art { position:absolute; inset:0 0 0 auto; width:48%; overflow:hidden; border-radius:0 8px 8px 0; pointer-events:none; }
.build-art::before { content:""; position:absolute; inset:0; z-index:1; background:linear-gradient(90deg, var(--panel), transparent 35%); }
.build-art img { width:calc(100% + 50px); height:100%; object-fit:cover; object-position:center 15%; opacity:.5; filter:grayscale(1); transform:scaleX(-1) translateX(-50px); transform-origin:center; transition:filter .2s, opacity .2s; }
.build-card.mine:hover .build-art img,
.build-card.mine:focus-within .build-art img { filter:grayscale(0); opacity:.65; }
@media (max-width: 520px) { .build-card { padding-right:24px; } .build-art { width:55%; } .build-art img { opacity:.28; } }
.build-card h3 { margin:0 0 12px; }
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
.tier-criteria { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 10px; }
.tier-chip { padding:0 6px; border:1px solid currentColor; border-radius:3px; font:500 .6875rem/1.5 Inter, sans-serif; background:transparent !important; }
.build-card p { line-height:1.6; }
.build-actions { margin-top:20px; }
.build-actions p { flex-basis:100%; margin:0; }
.build-actions .field { flex-basis:100%; }
.build-actions a { text-decoration:none; }
@media(max-width:600px) { .build-library { padding:0 12px 24px; } }
</style>
