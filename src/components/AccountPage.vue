<script setup>
// The signed-in player's account: their public display name, the builds saved to their account
// (private or published), and deleting the account. Signed out, it asks them to sign in.
import { ref, watch } from "vue";
import { useAuth } from "../composables/useAuth.js";
import { useSavedBuilds, MAX_NAME } from "../planner/savedBuilds.js";
import { plannerHash } from "../planner/buildCode.js";
import { getProfile, saveDisplayName, listMyBuilds, addBuilds, updateBuild, deleteBuild, deleteAccount, listMyFilters, updateFilter, deleteFilter } from "../planner/accountData.js";
import { useSavedFilters } from "../filters/savedFilters.js";
import { useFilterSync } from "../filters/filterSync.js";
import { cleanFilter } from "../filters/lootFilter.js";
const { user, setDisplayName } = useAuth();
const { builds: local } = useSavedBuilds();
const { filters: localFilters, remove: removeLocalFilter } = useSavedFilters();
const filterSync = useFilterSync();

const displayName = ref(""), nameInput = ref(""), nameMsg = ref(""), nameError = ref(""), savingName = ref(false);
const builds = ref([]), buildsError = ref(""), loading = ref(false), uploadMsg = ref("");
const editing = ref(null), editName = ref(""), confirmDelete = ref(null);
const deleteText = ref(""), deleteError = ref(""), deleting = ref(false);

// Loot filters in the account: renamed or deleted here, and in this browser too.
const lootFilters = ref([]), filtersError = ref(""), editingFilter = ref(null), filterName = ref(""), confirmFilterDelete = ref(null);
async function loadFilters() {
  const r = await listMyFilters(user.value.id);
  if (r.ok) { lootFilters.value = r.filters; filtersError.value = ""; } else filtersError.value = r.reason;
}
async function renameFilter(f) {
  const name = filterName.value.trim().slice(0, 60);
  if (!name) return;
  const filter = cleanFilter({ ...f.filter, name });
  const r = await updateFilter(f.id, filter);
  if (!r.ok) return (filtersError.value = r.reason);
  f.filter = filter;
  f.name = name;
  editingFilter.value = null;
  const here = localFilters.value.find((e) => e.accountId === f.id);
  if (here) here.filter.name = name;
}
async function removeFilter(f) {
  const r = await deleteFilter(f.id);
  if (!r.ok) return (filtersError.value = r.reason);
  lootFilters.value = lootFilters.value.filter((x) => x.id !== f.id);
  confirmFilterDelete.value = null;
  const here = localFilters.value.find((e) => e.accountId === f.id);
  if (here) removeLocalFilter(here.id);
}
// This browser's filters not yet in the account, to send up.
const filtersNotUploaded = () => localFilters.value.filter((e) => !e.accountId);
const filterMsg = ref("");
async function uploadFilters() {
  const list = filtersNotUploaded();
  if (!list.length) return (filterMsg.value = "Every filter in this browser is already in your account.");
  for (const e of list) await filterSync.saveToAccount(e.id);
  filterMsg.value = filterSync.syncError.value || `Added ${list.length} filter${list.length > 1 ? "s" : ""} to your account.`;
  loadFilters();
}

async function load() {
  if (!user.value) return;
  loading.value = true;
  loadFilters();
  const [p, b] = await Promise.all([getProfile(user.value.id), listMyBuilds(user.value.id)]);
  loading.value = false;
  if (p.ok) nameInput.value = displayName.value = p.displayName;
  if (b.ok) { builds.value = b.builds; buildsError.value = ""; } else buildsError.value = b.reason;
}
watch(user, load, { immediate: true });

async function saveName() {
  nameMsg.value = nameError.value = "";
  savingName.value = true;
  const r = await saveDisplayName(user.value.id, nameInput.value);
  savingName.value = false;
  if (r.ok) { displayName.value = nameInput.value = r.displayName; setDisplayName(r.displayName); nameMsg.value = "Saved."; }
  else nameError.value = r.reason;
}

// Builds saved in this browser that aren't in the account yet (by their code), to upload.
const notUploaded = () => local.value.filter((l) => !builds.value.some((b) => b.code === l.code));
async function upload() {
  const list = notUploaded();
  if (!list.length) return (uploadMsg.value = "Everything saved in this browser is already in your account.");
  const r = await addBuilds(list);
  uploadMsg.value = r.ok ? `Added ${list.length} build${list.length > 1 ? "s" : ""} to your account.` : r.reason;
  if (r.ok) load();
}
async function setPublished(b, published) {
  const r = await updateBuild(b.id, { published });
  if (r.ok) b.published = published; else buildsError.value = r.reason;
}
async function rename(b) {
  const name = editName.value.trim().slice(0, MAX_NAME);
  if (!name) return;
  const r = await updateBuild(b.id, { name });
  if (r.ok) { b.name = name; editing.value = null; } else buildsError.value = r.reason;
}
async function remove(b) {
  const r = await deleteBuild(b.id);
  if (r.ok) { builds.value = builds.value.filter((x) => x.id !== b.id); confirmDelete.value = null; } else buildsError.value = r.reason;
}
async function removeAccount() {
  deleteError.value = "";
  deleting.value = true;
  const r = await deleteAccount();
  deleting.value = false;
  if (r.ok) window.location.hash = "#runewords";
  else deleteError.value = r.reason;
}
const openHref = (b) => `#${plannerHash(b.code)}&name=${encodeURIComponent(b.name)}&mine=1&aid=${b.id}`;
const signIn = () => window.dispatchEvent(new Event("account-open"));
</script>
<template>
  <section class="account-page">
    <div v-if="!user" class="acct-panel">
      <h2>Sign in to manage your account</h2>
      <p class="muted">Your display name, the builds saved to your account, and deleting your account live here.</p>
      <button type="button" class="btn gold" @click="signIn">Sign in</button>
    </div>
    <template v-else>
      <section class="acct-panel" aria-labelledby="acct-name">
        <h2 id="acct-name">Display name</h2>
        <p class="muted">What other players see on the builds you publish. Your Google name and email are never shown.</p>
        <form class="acct-row" @submit.prevent="saveName">
          <label class="field">Display name<input v-model="nameInput" maxlength="24" autocomplete="nickname" placeholder="3 to 24 letters or numbers" /></label>
          <button class="btn gold" :disabled="savingName || nameInput.trim() === displayName">{{ savingName ? "Saving…" : "Save" }}</button>
        </form>
        <p v-if="nameMsg" class="acct-ok" role="status">{{ nameMsg }}</p>
        <p v-if="nameError" class="acct-bad" role="alert">{{ nameError }}</p>
        <p v-if="!displayName && !nameError" class="acct-hint">Choose a display name before publishing a build.</p>
      </section>

      <section class="acct-panel" aria-labelledby="acct-builds">
        <h2 id="acct-builds">Your builds <span class="acct-count">{{ builds.length }}</span></h2>
        <p class="muted">Saved to your account, on any device. Private builds are only yours; published ones show your display name.</p>
        <div class="acct-row">
          <button type="button" class="btn" @click="upload">Add the builds saved in this browser</button>
        </div>
        <p v-if="uploadMsg" class="acct-ok" role="status">{{ uploadMsg }}</p>
        <p v-if="buildsError" class="acct-bad" role="alert">{{ buildsError }}</p>
        <p v-if="loading" class="muted">Loading…</p>
        <p v-else-if="!builds.length" class="acct-empty">No builds in your account yet.</p>
        <ul v-else class="acct-builds">
          <li v-for="b in builds" :key="b.id">
            <div class="acct-build-main">
              <form v-if="editing === b.id" class="acct-row" @submit.prevent="rename(b)">
                <label class="field">Build name<input v-model="editName" :maxlength="MAX_NAME" required /></label>
                <button class="btn gold">Save</button><button type="button" class="btn" @click="editing = null">Cancel</button>
              </form>
              <template v-else>
                <b>{{ b.name }}</b>
                <small>{{ b.cls }} · Level {{ b.level ?? "unknown" }} · <span :class="b.published ? 'acct-pub' : 'acct-priv'">{{ b.published ? "Published" : "Private" }}</span></small>
              </template>
            </div>
            <div v-if="confirmDelete === b.id" class="acct-row">
              <span>Delete this build?</span>
              <button type="button" class="btn" @click="remove(b)">Delete</button><button type="button" class="btn" @click="confirmDelete = null">Cancel</button>
            </div>
            <div v-else-if="editing !== b.id" class="acct-row">
              <a class="btn gold" :href="openHref(b)">Open</a>
              <button type="button" class="btn" :disabled="!b.published && !displayName" :title="!b.published && !displayName ? 'Choose a display name first' : ''" @click="setPublished(b, !b.published)">{{ b.published ? "Unpublish" : "Publish" }}</button>
              <button type="button" class="btn" @click="editing = b.id; editName = b.name">Rename</button>
              <button type="button" class="btn" @click="confirmDelete = b.id">Delete</button>
            </div>
          </li>
        </ul>
      </section>

      <section class="acct-panel" aria-labelledby="acct-filters">
        <h2 id="acct-filters">Your loot filters <span class="acct-count">{{ lootFilters.length }}</span></h2>
        <p class="muted">Saved to your account, on any device. Only you can see them. Edit them on the Loot Filters page.</p>
        <div class="acct-row">
          <button type="button" class="btn" @click="uploadFilters">Add the filters saved in this browser</button>
        </div>
        <p v-if="filterMsg" class="acct-ok" role="status">{{ filterMsg }}</p>
        <p v-if="filtersError" class="acct-bad" role="alert">{{ filtersError }}</p>
        <p v-if="!lootFilters.length" class="acct-empty">No loot filters in your account yet.</p>
        <ul v-else class="acct-builds">
          <li v-for="f in lootFilters" :key="f.id">
            <div class="acct-build-main">
              <form v-if="editingFilter === f.id" class="acct-row" @submit.prevent="renameFilter(f)">
                <label class="field">Filter name<input v-model="filterName" maxlength="60" required /></label>
                <button class="btn gold">Save</button><button type="button" class="btn" @click="editingFilter = null">Cancel</button>
              </form>
              <template v-else>
                <b>{{ f.name }}</b>
                <small>{{ (f.filter.rules || []).length }} rules · Last edited {{ new Date(f.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) }}</small>
              </template>
            </div>
            <div v-if="confirmFilterDelete === f.id" class="acct-row">
              <span>Delete this filter from your account and this browser?</span>
              <button type="button" class="btn" @click="removeFilter(f)">Delete</button><button type="button" class="btn" @click="confirmFilterDelete = null">Cancel</button>
            </div>
            <div v-else-if="editingFilter !== f.id" class="acct-row">
              <a class="btn gold" href="#filters">Open Loot Filters</a>
              <button type="button" class="btn" @click="editingFilter = f.id; filterName = f.name">Rename</button>
              <button type="button" class="btn" @click="confirmFilterDelete = f.id">Delete</button>
            </div>
          </li>
        </ul>
      </section>

      <section class="acct-panel acct-danger" aria-labelledby="acct-delete">
        <h2 id="acct-delete">Delete account</h2>
        <p class="muted">Deletes your account, display name and every build and loot filter saved to it, for good. Builds and filters saved in this browser stay here.</p>
        <form class="acct-row" @submit.prevent="removeAccount">
          <label class="field">Type DELETE to confirm<input v-model="deleteText" autocomplete="off" /></label>
          <button class="btn" :disabled="deleteText !== 'DELETE' || deleting">{{ deleting ? "Deleting…" : "Delete my account" }}</button>
        </form>
        <p v-if="deleteError" class="acct-bad" role="alert">{{ deleteError }}</p>
      </section>
    </template>
  </section>
</template>
<style scoped>
.account-page { display: grid; gap: 20px; max-width: 760px; padding: 0 24px 32px; }
.acct-panel { display: grid; gap: 12px; padding: 20px 22px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
.acct-panel h2 { margin: 0; display: flex; align-items: center; gap: 10px; color: var(--gold); font-family: var(--serif); font-size: 1.25rem; }
.acct-panel p { margin: 0; line-height: 1.5; }
.acct-count { padding: 1px 9px; border-radius: 10px; background: var(--gold-bg); border: 1px solid var(--gold); font: 500 .8125rem Inter, sans-serif; }
.acct-row { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
.field { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 200px; color: var(--muted); font-size: .8125rem; }
.field input { padding: 10px 12px; font: inherit; font-size: .875rem; color: var(--text); }
.acct-ok { color: var(--good); font-size: .8125rem; }
.acct-bad { color: var(--red, #c0584f); font-size: .8125rem; }
.acct-hint { color: var(--warn); font-size: .8125rem; }
.acct-empty { padding: 14px; border: 1px dashed var(--border); border-radius: 8px; color: var(--muted); text-align: center; }
.acct-builds { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.acct-builds li { display: grid; gap: 10px; padding: 12px 14px; border: 1px solid var(--soft-border); border-radius: 8px; background: var(--field); }
.acct-build-main { display: grid; gap: 2px; }
.acct-build-main small { color: var(--muted); }
.acct-pub { color: var(--good); }
.acct-priv { color: var(--muted); }
.acct-builds a { text-decoration: none; }
.acct-danger { border-color: color-mix(in srgb, var(--red, #c0584f) 45%, var(--border)); }
@media (max-width: 600px) { .account-page { padding: 0 12px 24px; } }
</style>
