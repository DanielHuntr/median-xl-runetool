// The signed-in player (Supabase Auth), shared across the site. Sign-in is with Google (and any
// other provider switched on in Supabase and listed in AUTH_PROVIDERS); there is no email sign-in.
import { ref, computed, watch } from "vue";
import { supabase, AUTH_PROVIDERS } from "../lib/supabase.js";

const user = ref(null);
const ready = ref(false);
// The display name the player chose (profiles table), shown in place of their Google name.
const displayName = ref("");
watch(user, async (u) => {
  displayName.value = "";
  if (!u) return;
  try {
    const { getProfile } = await import("../planner/accountData.js");
    const p = await getProfile(u.id);
    if (p.ok && user.value?.id === u.id) displayName.value = p.displayName;
  } catch {}
});
let started = false;

// Picks up an existing session (and one returning from sign-in) and follows changes.
async function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const sb = await supabase();
    const { data } = await sb.auth.getSession();
    user.value = data.session?.user ?? null;
    sb.auth.onAuthStateChange((_event, session) => { user.value = session?.user ?? null; });
  } catch {
    user.value = null;
  } finally {
    ready.value = true;
  }
}

// Where the provider sends the player back to: the site's address (without the
// #page, which Supabase's allowed redirect list wouldn't match).
const returnTo = () => window.location.origin + window.location.pathname;

export function useAuth() {
  start();
  return {
    user,
    ready,
    providers: AUTH_PROVIDERS,
    // The account's display name, never the Google name or email; a prompt until one is chosen.
    name: computed(() => displayName.value || (user.value ? "Choose a name" : "")),
    displayName,
    /** After saving a new display name (the account page). */
    setDisplayName: (n) => { displayName.value = n; },
    /** Google or Discord (when switched on in Supabase). */
    async signInWith(provider) {
      const { error } = await (await supabase()).auth.signInWithOAuth({ provider, options: { redirectTo: returnTo() } });
      return error ? { ok: false, reason: error.message } : { ok: true };
    },
    async signOut() {
      await (await supabase()).auth.signOut();
      user.value = null;
    },
  };
}
