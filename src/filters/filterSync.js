// Keeps the loot filters saved in this browser and the ones in the signed-in player's account
// in step. A filter saved to the account carries its accountId; edits to it are sent after a
// short pause (or marked dirty while signed out, and sent on the next sign-in). Signing in
// brings the account's filters into this browser.
import { ref, watch, effectScope } from "vue";
import { useAuth } from "../composables/useAuth.js";
import { useSavedFilters } from "./savedFilters.js";
import { cleanFilter } from "./lootFilter.js";
import { listMyFilters, addFilter, updateFilter, deleteFilter } from "../planner/accountData.js";

const syncError = ref("");
const timers = new Map();
let started = false;

export function useFilterSync() {
  const { user } = useAuth();
  const { filters } = useSavedFilters();
  const entry = (id) => filters.value.find((f) => f.id === id);

  async function push(e) {
    if (!user.value || !e?.accountId) return;
    const r = await updateFilter(e.accountId, cleanFilter(e.filter));
    if (r.ok) { e.dirty = false; syncError.value = ""; } else syncError.value = r.reason;
  }
  // Signed in: the account's filters join this browser's. A filter edited here while signed out
  // is sent up; otherwise the account's copy is the one kept.
  async function pull() {
    if (!user.value) return;
    const r = await listMyFilters(user.value.id);
    if (!r.ok) return (syncError.value = r.reason);
    syncError.value = "";
    for (const a of r.filters) {
      const e = filters.value.find((f) => f.accountId === a.id);
      if (!e) filters.value.push({ id: `a${a.id.slice(0, 30)}`, from: "", filter: cleanFilter(a.filter), accountId: a.id, dirty: false });
      else if (e.dirty) push(e);
      else e.filter = cleanFilter(a.filter);
    }
    // Saved to an account but no longer in it (deleted on another device): kept here, unlinked.
    for (const e of filters.value) if (e.accountId && !r.filters.some((a) => a.id === e.accountId)) { e.accountId = ""; e.dirty = false; }
  }
  if (!started) {
    started = true;
    // Outlives the page that first asked for it.
    effectScope(true).run(() => watch(user, (u, was) => { if (u && u.id !== was?.id) pull(); }, { immediate: true }));
  }

  return {
    syncError,
    /** After an edit to a filter (the page watches the open one). */
    changed(id) {
      const e = entry(id);
      if (!e?.accountId) return;
      e.dirty = true;
      if (!user.value) return;
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => push(entry(id)), 1200));
    },
    async saveToAccount(id) {
      const e = entry(id);
      if (!user.value || !e || e.accountId) return { ok: false };
      const r = await addFilter(cleanFilter(e.filter));
      if (r.ok) { e.accountId = r.id; e.dirty = false; syncError.value = ""; } else syncError.value = r.reason;
      return r;
    },
    /** Removes it from the account (the copy in this browser stays unless removed too). */
    async removeFromAccount(id) {
      const e = entry(id);
      if (!e?.accountId) return { ok: true };
      clearTimeout(timers.get(id));
      const r = await deleteFilter(e.accountId);
      if (r.ok) { e.accountId = ""; e.dirty = false; } else syncError.value = r.reason;
      return r;
    },
    pull,
  };
}
