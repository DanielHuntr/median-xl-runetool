<script setup>
import { computed, ref } from 'vue';
import { useSavedBuilds, MAX_NAME } from '../planner/savedBuilds.js';
import { encodeBuild, plannerHash } from '../planner/buildCode.js';
import presets from '../data/preset-builds.json';
import ClassPicker from './ClassPicker.vue';
const { builds, rename, remove } = useSavedBuilds();
const classes = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];
const cls = ref(''), query = ref(''), editing = ref(null), name = ref(''), deleting = ref(null), error = ref('');
const matches = b => (!cls.value || b.cls === cls.value) && `${b.name} ${b.cls} ${(b.skills || []).join(' ')}`.toLowerCase().includes(query.value.trim().toLowerCase());
const saved = computed(() => builds.value.filter(matches));
const starters = computed(() => presets.presets.filter(matches));
const href = (b, preset = false) => `#${plannerHash(preset ? encodeBuild(b.build) : b.code)}&name=${encodeURIComponent(b.name)}`;
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
    <h2>Saved builds</h2>
    <p class="muted">Snapshots saved in this browser. Use Save build in the planner to keep a build before experimenting. Opening a snapshot replaces that class's current planner build.</p>
    <p v-if="!saved.length" class="muted">{{ builds.length ? 'No saved builds match these filters.' : 'No snapshots yet. Save your first build from the character planner.' }}</p>
    <div class="build-grid">
      <article v-for="b in saved" :key="b.id" class="build-card">
        <h3>{{ b.name }}</h3>
        <p>{{ b.cls }} · Level {{ b.level ?? 'unknown' }}</p>
        <p v-if="b.skills.length" class="muted">{{ b.skills.join(' · ') }}</p>
        <small v-if="b.savedAt" class="muted">Saved {{ new Date(b.savedAt).toLocaleString() }}</small>
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
    <h2>Starter builds</h2>
    <p class="muted">Generated with the planner for patch {{ presets.patch }}. These are starting points, not builds verified in game. Opening one replaces that class's current planner build; save your current build first if you want to keep it.</p>
    <p v-if="!starters.length" class="muted">No starter builds match these filters.</p>
    <div class="build-grid">
      <article v-for="b in starters" :key="b.id" class="build-card">
        <h3>{{ b.name }}</h3><p>{{ b.cls }} · Level {{ b.build.level }}</p>
        <p class="muted">{{ b.blurb }}</p>
        <p v-if="b.summary" class="muted">{{ b.summary.life.toLocaleString() }} life · {{ b.summary.mana.toLocaleString() }} mana</p>
        <p v-if="b.summary?.unspent" class="muted">{{ b.summary.unspent }} skill points left to customise.</p>
        <p v-else-if="b.summary" class="muted">All skill points allocated · {{ b.build.signets }} Signets of Learning</p>
        <div class="build-actions"><a class="btn gold" :href="href(b, true)">Open starter build</a></div>
      </article>
    </div>
  </section>
</template>
<style scoped>
.build-library { padding: 0 24px 32px; }
.field { display:flex; flex-direction:column; gap:8px; color:var(--muted); font-size:.8125rem; margin:0; }
.field input { padding:10px 12px; font:inherit; font-size:.875rem; color:var(--text); }
.build-filters, .build-actions { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.build-filters { margin-bottom:28px; align-items:end; }
.build-filters .field { flex:1; min-width:200px; }
.build-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr)); gap:20px; margin:20px 0 36px; }
.build-card { padding:24px; border:1px solid var(--border); border-radius:8px; background:var(--panel); }
.build-card h3 { margin:0 0 12px; }
.build-card p { line-height:1.6; }
.build-actions { margin-top:20px; }
.build-actions p { flex-basis:100%; margin:0; }
.build-actions .field { flex-basis:100%; }
.build-actions a { text-decoration:none; }
@media(max-width:600px) { .build-library { padding:0 12px 24px; } }
</style>
