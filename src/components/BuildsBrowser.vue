<script setup>
import { computed, ref, watch } from 'vue';
import { listPublished, myLikes, setLike, listMyBuilds, addBuilds, updateBuild, deleteBuild as deleteFromAccount } from '../planner/accountData.js';
import { useAuth } from '../composables/useAuth.js';
import { useSavedBuilds, MAX_NAME } from '../planner/savedBuilds.js';
import { decodeBuild, plannerHash } from '../planner/buildCode.js';
import ClassPicker from './ClassPicker.vue';
import Icon from './AppIcon.vue';
const { builds, rename, remove } = useSavedBuilds();
const { user, displayName } = useAuth();
const classes = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];
const cls = ref(''), query = ref(''), editing = ref(null), name = ref(''), deleting = ref(null), error = ref('');
const matches = b => (!cls.value || b.cls === cls.value) && `${b.name} ${b.cls} ${(b.skills || []).join(' ')}`.toLowerCase().includes(query.value.trim().toLowerCase());
// Your builds: the ones saved in this browser and, signed in, the ones in your account, as one
// list (a build in both shows once).
const account = ref([]);
async function loadAccount() {
  if (!user.value) return (account.value = []);
  const r = await listMyBuilds(user.value.id).catch(() => ({ ok: false }));
  account.value = r.ok ? r.builds : [];
}
watch(user, loadAccount, { immediate: typeof window !== 'undefined' });
const mine = computed(() => {
  const list = account.value.map((a) => ({ key: 'a' + a.id, name: a.name, cls: a.cls, level: a.level, code: a.code, skills: a.skills || [], savedAt: a.updated_at, accountId: a.id, published: a.published }));
  for (const l of builds.value) {
    const twin = list.find((m) => !m.localId && (m.code === l.code || (m.name === l.name && m.cls === l.cls)));
    if (twin) twin.localId = l.id;
    else list.push({ ...l, key: 'l' + l.id, skills: l.skills || [], localId: l.id });
  }
  return list.sort((x, y) => new Date(y.savedAt || 0) - new Date(x.savedAt || 0));
});
const saved = computed(() => mine.value.filter(matches));
const where = (b) => (b.accountId ? (b.published ? 'Published' : 'In your account') : 'This browser only');
// A saved build's tiers as its author gave them (inside the build): overall and per criterion.
const authorTiersOf = (b) => {
  const t = decodeBuild(b.code)?.authorTiers || {};
  return Object.fromEntries(['tier', 'bossTier', 'clearTier', 'surviveTier'].filter((k) => /^[SABCDF]$/.test(t[k] || '')).map((k) => [k, t[k]]));
};
const CRITERIA = [['bossTier', 'Bossing'], ['clearTier', 'Clearing'], ['surviveTier', 'Survival']];
// Each class's card art (public/builds/<class>.webp).
const art = (cls) => `${import.meta.env.BASE_URL}builds/${cls.toLowerCase()}.webp`;
const href = (b) => `#${plannerHash(b.code)}&name=${encodeURIComponent(b.name)}&mine=1${b.localId ? `&id=${b.localId}` : ''}${b.accountId ? `&aid=${b.accountId}` : ''}`;
// Community builds: published by players with an account, newest first (accountData.js).
const community = ref([]), communityState = ref('loading'), sort = ref('new'), liked = ref(new Set());
async function loadCommunity() {
  communityState.value = 'loading';
  const r = await listPublished({ cls: cls.value, sort: sort.value }).catch(() => ({ ok: false }));
  community.value = r.ok ? r.builds : [];
  communityState.value = r.ok ? 'ready' : 'error';
  loadLikes();
}
async function loadLikes() {
  if (!user.value) return (liked.value = new Set());
  const r = await myLikes(user.value.id, community.value.map((b) => b.id)).catch(() => ({ ok: false }));
  if (r.ok) liked.value = r.ids;
}
watch([cls, sort], loadCommunity, { immediate: typeof window !== 'undefined' });
watch(user, loadLikes);
const own = (b) => user.value && b.user_id === user.value.id;
// Likes: shown to everyone; signed in, a like on others' builds (signed out, it asks to sign in).
const liking = ref(null);
async function toggleLike(b) {
  if (!user.value) return window.dispatchEvent(new Event('account-open'));
  if (own(b) || liking.value) return;
  const on = !liked.value.has(b.id);
  liking.value = b.id;
  const r = await setLike(b.id, on);
  liking.value = null;
  if (!r.ok) return (error.value = r.reason);
  const next = new Set(liked.value);
  on ? next.add(b.id) : next.delete(b.id);
  liked.value = next;
  b.likes = Math.max(0, (b.likes || 0) + (on ? 1 : -1));
}
const likeTip = (b) => (!user.value ? 'Sign in to like builds' : own(b) ? 'Your build' : liked.value.has(b.id) ? 'Remove your like' : 'Like this build');
const shared = computed(() => community.value.filter(matches));
const sharedHref = (b) => `#${plannerHash(b.code)}&name=${encodeURIComponent(b.name)}`;
async function commitRename(b) {
  const next = name.value.trim().slice(0, MAX_NAME);
  if (!next) return;
  if (b.localId) { const r = rename(b.localId, next); if (!r.ok) return (error.value = r.reason); }
  if (b.accountId) { const r = await updateBuild(b.accountId, { name: next }); if (!r.ok) return (error.value = r.reason); }
  error.value = '';
  editing.value = null;
  loadAccount();
}
async function deleteBuild(b) {
  if (b.localId && !remove(b.localId)) return (error.value = 'Your browser could not delete this build. Please try again.');
  if (b.accountId) { const r = await deleteFromAccount(b.accountId); if (!r.ok) return (error.value = r.reason); }
  deleting.value = null;
  error.value = '';
  loadAccount();
  if (b.published) loadCommunity();
}
async function toAccount(b) {
  const r = await addBuilds([b]);
  error.value = r.ok ? '' : r.reason;
  loadAccount();
}
async function setPublished(b, published) {
  if (published && !displayName.value) return (error.value = 'Choose a display name on your account page before publishing.');
  const r = await updateBuild(b.accountId, { published });
  error.value = r.ok ? '' : r.reason;
  loadAccount();
  loadCommunity();
}
</script>
<template>
  <section class="build-library">
    <div class="build-filters">
      <ClassPicker v-model="cls" :classes="classes" any-label="All classes" />
      <label class="search build-search"><Icon name="search" /><input v-model="query" type="search" placeholder="Search builds by name or skill" aria-label="Search builds by name or skill" /></label>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <section class="mine-section" aria-labelledby="mine-title">
    <h2 id="mine-title" class="mine-title">Your builds <span class="mine-count">{{ mine.length }}</span></h2>
    <p class="muted">{{ user ? 'Saved in this browser or to your account with Save build in the planner.' : 'Saved in this browser with Save build in the planner. Sign in to keep them on any device and publish them.' }} Opening one keeps your current build for that class aside, to go back to.</p>
    <p v-if="!saved.length" class="mine-empty">{{ mine.length ? 'None of your saved builds match these filters.' : "You haven’t saved a build yet. Use Save build in the Character Planner and it will appear here." }}</p>
    <div class="build-grid">
      <article v-for="b in saved" :key="b.key" class="build-card mine">
        <div class="build-art" aria-hidden="true"><img :src="art(b.cls)" alt="" loading="lazy" /></div>
        <!-- The tiers its author gave it (inside the build). -->
        <h3><span v-if="authorTiersOf(b).tier" class="tier-badge" :class="`tier-${authorTiersOf(b).tier}`" :aria-label="`Tier ${authorTiersOf(b).tier}`">{{ authorTiersOf(b).tier }}</span>{{ b.name }}</h3>
        <p>{{ b.cls }} · Level {{ b.level ?? 'unknown' }}</p>
        <p class="mine-where" :class="{ pub: b.published, local: !b.accountId }">{{ where(b) }}</p>
        <p v-if="CRITERIA.some(([k]) => authorTiersOf(b)[k])" class="tier-criteria mine-tiers">
          <template v-for="[k, label] in CRITERIA" :key="k"><span v-if="authorTiersOf(b)[k]" :class="`tier-chip tier-${authorTiersOf(b)[k]}`">{{ label }} {{ authorTiersOf(b)[k] }}</span></template>
        </p>
        <p v-if="b.skills.length" class="muted">{{ b.skills.join(' · ') }}</p>
        <p v-if="b.savedAt" class="mine-edited">Last edited {{ new Date(b.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) }}</p>
        <form v-if="editing === b.key" class="build-actions" @submit.prevent="commitRename(b)">
          <label class="field">Build name<input v-model="name" :maxlength="MAX_NAME" required /></label>
          <button class="btn gold">Save name</button><button type="button" class="btn" @click="editing = null">Cancel</button>
        </form>
        <div v-else-if="deleting === b.key" class="build-actions">
          <p>{{ b.accountId ? (b.published ? 'Delete this build from your account and the community list?' : 'Delete this build from your account?') : 'Delete this saved build?' }}</p><button class="btn" @click="deleteBuild(b)">Delete</button><button class="btn" @click="deleting = null">Cancel</button>
        </div>
        <div v-else class="build-actions">
          <a class="btn gold" :href="href(b)">Open build</a>
          <button v-if="b.accountId" class="btn" @click="setPublished(b, !b.published)">{{ b.published ? 'Unpublish' : 'Publish' }}</button>
          <button v-else-if="user" class="btn" @click="toAccount(b)">Save to account</button>
          <button class="btn" @click="editing = b.key; name = b.name; error = ''">Rename</button>
          <button class="btn" @click="deleting = b.key">Delete</button>
        </div>
      </article>
    </div>
    </section>
    <section class="community-section" aria-labelledby="community-title">
      <h2 id="community-title" class="mine-title">Community builds <span class="mine-count">{{ shared.length }}</span></h2>
      <div class="community-head">
        <p class="muted">Published by players. Sign in, then tick "Publish it on the Builds page" when you save a build to share yours.</p>
        <div class="sort-toggle" role="group" aria-label="Sort community builds">
          <button type="button" :aria-pressed="sort === 'new'" @click="sort = 'new'">Newest</button>
          <button type="button" :aria-pressed="sort === 'liked'" @click="sort = 'liked'">Most liked</button>
        </div>
      </div>
      <p v-if="communityState === 'loading'" class="muted">Loading…</p>
      <p v-else-if="communityState === 'error'" class="mine-empty">Community builds couldn't be loaded right now.</p>
      <p v-else-if="!shared.length" class="mine-empty">{{ community.length ? 'No community builds match these filters.' : 'No community builds yet. Be the first to publish one.' }}</p>
      <div v-else class="build-grid">
        <article v-for="b in shared" :key="b.id" class="build-card mine">
          <div class="build-art" aria-hidden="true"><img :src="art(b.cls)" alt="" loading="lazy" /></div>
          <h3><span v-if="authorTiersOf(b).tier" class="tier-badge" :class="`tier-${authorTiersOf(b).tier}`" :aria-label="`Tier ${authorTiersOf(b).tier}`">{{ authorTiersOf(b).tier }}</span>{{ b.name }}</h3>
          <p>{{ b.cls }} · Level {{ b.level ?? 'unknown' }} · by {{ b.author }}<span v-if="user && b.user_id === user.id" class="mine-you"> (you)</span></p>
          <p v-if="CRITERIA.some(([k]) => authorTiersOf(b)[k])" class="tier-criteria">
            <template v-for="[k, label] in CRITERIA" :key="k"><span v-if="authorTiersOf(b)[k]" :class="`tier-chip tier-${authorTiersOf(b)[k]}`">{{ label }} {{ authorTiersOf(b)[k] }}</span></template>
          </p>
          <p v-if="b.skills?.length" class="muted">{{ b.skills.join(' · ') }}</p>
          <div class="build-actions">
            <a class="btn gold" :href="sharedHref(b)">Open build</a>
            <button
              type="button"
              class="like-btn"
              :class="{ on: liked.has(b.id) }"
              :aria-pressed="liked.has(b.id)"
              :disabled="own(b) || liking === b.id"
              :aria-label="`${likeTip(b)} (${b.likes || 0} like${b.likes === 1 ? '' : 's'})`"
              :data-tip="likeTip(b)"
              @click="toggleLike(b)"
            ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>{{ b.likes || 0 }}</button>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
<style scoped>
.build-library { padding: 0 0 32px; }
.field { display:flex; flex-direction:column; gap:8px; color:var(--muted); font-size:.8125rem; margin:0; }
.field input { padding:10px 12px; font:inherit; font-size:.875rem; color:var(--text); }
.build-filters, .build-actions { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.build-filters { margin-bottom:28px; align-items:stretch; }
.build-search { flex:1; min-width:200px; margin:0; }
/* Two columns however many cards there are (auto-fit stretched a lone card to full width). */
.build-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; margin:20px 0 36px; }
@media (max-width: 760px) { .build-grid { grid-template-columns:minmax(0, 1fr); } }
.mine-section { margin:0 0 12px; padding:20px 22px 4px; border:1px solid var(--border); border-radius:10px; background:color-mix(in srgb, var(--field) 42%, transparent); }
.mine-title { display:flex; align-items:center; gap:10px; margin:0 0 6px; color:var(--gold); }
.mine-count { padding:1px 9px; border-radius:10px; background:var(--gold-bg); border:1px solid var(--gold); font-size:.8125rem; font-family:inherit; }
.mine-empty { margin:16px 0 20px; padding:16px; border:1px dashed var(--border); border-radius:8px; color:var(--muted); text-align:center; }
.community-section { margin:24px 0 0; padding:20px 22px 4px; border:1px solid var(--border); border-radius:10px; }
.build-card { position:relative; padding:24px calc(40% + 8px) 24px 24px; border:1px solid var(--border); border-radius:8px; background:var(--panel); overflow:visible; }
.build-card.mine { border-color:color-mix(in srgb, var(--gold) 45%, var(--border)); transition:border-color .15s, box-shadow .15s; }
.build-card.mine:hover,
.build-card.mine:focus-within { border-color:var(--gold); box-shadow:0 0 0 1px color-mix(in srgb, var(--gold) 40%, transparent) inset, 0 0 18px color-mix(in srgb, var(--gold) 16%, transparent); }
.community-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px; }
.community-head p { margin:0; }
.sort-toggle { display:flex; border:1px solid var(--border); border-radius:6px; overflow:hidden; }
.sort-toggle button { padding:6px 12px; border:0; background:none; color:var(--muted); font:inherit; font-size:.8125rem; cursor:pointer; }
.sort-toggle button + button { border-left:1px solid var(--border); }
.sort-toggle button[aria-pressed="true"] { background:var(--gold-bg); color:var(--gold); }
.like-btn { display:inline-flex; align-items:center; gap:6px; min-height:36px; padding:0 12px; border:1px solid var(--border); border-radius:6px; background:var(--field); color:var(--muted); font:inherit; font-size:.875rem; cursor:pointer; transition:color .15s, border-color .15s; }
.like-btn svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linejoin:round; }
.like-btn:hover:not(:disabled) { color:var(--gold); border-color:var(--gold); }
.like-btn.on { color:var(--gold); border-color:color-mix(in srgb, var(--gold) 60%, var(--border)); }
.like-btn.on svg { fill:currentColor; }
.like-btn:disabled { cursor:default; }
.mine-where { margin:0; color:var(--muted); font-size:.75rem; }
.mine-where.pub { color:var(--good); }
.mine-you { color:var(--gold); }
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
@media(max-width:600px) { .build-library { padding:0 0 24px; } }
</style>
