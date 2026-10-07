// The signed-in player (Supabase Auth), shared across the site. Sign-in is with Google (and any
// other provider switched on in Supabase and listed in AUTH_PROVIDERS); there is no email sign-in.
import { ref, computed, watch } from "vue";
import { supabase, AUTH_PROVIDERS } from "../lib/supabase.js";

const user = ref(null);
const ready = ref(false);
// The display name the player chose (profiles table), shown in place of their Google name.
const displayName = ref("");
// Coming back from signing in (Google sends the player to the site's bare address): a player
// without a display name yet goes to the account page to choose one, since they can't publish
// a build without it and may not know; then on to the page they signed in from. One who has a
// name goes straight back to that page. The page is noted as they leave for Google.
const FROM = "runetool-signin-from", AFTER = "runetool-after-name";
const store = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} };
function takeFrom() {
  try {
    const v = JSON.parse(sessionStorage.getItem(FROM));
    sessionStorage.removeItem(FROM);
    return v && Date.now() - v.at < 15 * 60 * 1000 ? v.hash : null;
  } catch {
    return null;
  }
}
watch(user, async (u) => {
  displayName.value = "";
  if (!u) return;
  const back = takeFrom();
  let name = "", known = false;
  try {
    const { getProfile } = await import("../planner/accountData.js");
    const p = await getProfile(u.id);
    if (p.ok && user.value?.id === u.id) { displayName.value = name = p.displayName; known = true; }
  } catch {}
  if (back == null || !known) return;
  if (!name) {
    store(AFTER, back);
    window.location.hash = "#account?welcome";
  } else if (back && back !== window.location.hash) {
    window.location.hash = back;
  }
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
      store(FROM, JSON.stringify({ hash: window.location.hash || "#runewords", at: Date.now() }));
      const { error } = await (await supabase()).auth.signInWithOAuth({ provider, options: { redirectTo: returnTo() } });
      return error ? { ok: false, reason: error.message } : { ok: true };
    },
    async signOut() {
      await (await supabase()).auth.signOut();
      user.value = null;
    },
  };
}
