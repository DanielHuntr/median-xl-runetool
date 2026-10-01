<script setup>
// Sign in with Google or, signed in, who you are and sign out. Opened from the sidebar and the
// phone menu. Laid out like the site's other modals (Back up & restore).
import { ref, computed } from "vue";
import Icon from "./AppIcon.vue";
import { useAuth } from "../composables/useAuth.js";
import { useRunetool } from "../composables/useRunetool.js";
const { user, name, providers, signInWith, signOut } = useAuth();
const dialog = ref(null), error = ref("");
const { nav } = useRunetool();
const manage = () => { close(); nav("account"); };
const LABELS = { google: "Google", discord: "Discord" };
// The signed-in player's picture (from Google), for the account card.
const avatar = computed(() => user.value?.user_metadata?.avatar_url || user.value?.user_metadata?.picture || "");
const initial = computed(() => (name.value || "?").trim().charAt(0).toUpperCase());
function open() { error.value = ""; dialog.value?.showModal(); }
const close = () => dialog.value?.close();
defineExpose({ open });
async function viaProvider(p) {
  error.value = "";
  const r = await signInWith(p);
  if (!r.ok) error.value = r.reason;
}
</script>
<template>
  <dialog ref="dialog" class="account" aria-labelledby="account-title" @click="(e) => { if (e.target === dialog) close(); }">
    <div class="account-body">
      <header class="account-head">
        <div>
          <p class="eyebrow">Your account</p>
          <h2 id="account-title">{{ user ? name : "Sign in" }}</h2>
        </div>
        <button type="button" class="icon-btn" aria-label="Close" @click="close"><Icon name="close" /></button>
      </header>
      <template v-if="user">
        <div class="account-card">
          <img v-if="avatar" :src="avatar" alt="" class="account-avatar" referrerpolicy="no-referrer" />
          <span v-else class="account-avatar account-initial" aria-hidden="true">{{ initial }}</span>
          <div class="account-who"><b>{{ name }}</b><small>Signed in with Google</small></div>
        </div>
        <div class="account-actions">
          <button type="button" class="btn gold" @click="manage">Manage account</button>
          <button type="button" class="btn" @click="signOut(); close()">Sign out</button>
        </div>
      </template>
      <template v-else>
        <p class="account-note">Sign in to keep your builds in your account and share them with the community. <a href="#privacy" @click="close">Privacy</a></p>
        <div class="account-actions">
          <button v-for="p in providers.filter((x) => LABELS[x])" :key="p" type="button" class="btn provider-btn" @click="viaProvider(p)">
            <svg v-if="p === 'google'" class="provider-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Continue with {{ LABELS[p] }}
          </button>
        </div>
      </template>
      <p v-if="error" class="account-msg" role="alert">{{ error }}</p>
    </div>
  </dialog>
</template>
<style scoped>
.account { width: min(440px, calc(100vw - 32px)); padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); }
.account::backdrop { background: var(--shade); }
.account:focus, .account:focus-visible { outline: none; }
.account-body { display: grid; gap: 14px; padding: 20px 22px 22px; }
.account-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.account-head h2 { margin: 0; color: var(--gold); font-family: var(--serif); font-size: 1.6rem; overflow-wrap: anywhere; }
.eyebrow { margin: 0 0 4px; }
.account-note { margin: 0; color: var(--muted); font-size: 0.8125rem; line-height: 1.5; }
.account-card { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border: 1px solid var(--soft-border); border-radius: 8px; background: var(--field); }
.account-avatar { width: 40px; height: 40px; border-radius: 50%; flex: none; object-fit: cover; }
.account-initial { display: grid; place-items: center; background: var(--gold-bg); color: var(--gold); font-family: var(--serif); font-size: 1.125rem; border: 1px solid var(--gold); }
.account-who { display: grid; gap: 2px; min-width: 0; }
.account-who b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-who small { color: var(--muted); font-size: .8125rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.provider-btn { gap: 10px; }
.provider-logo { width: 18px; height: 18px; flex: none; }
.account-msg { margin: 0; padding: 10px 12px; border: 1px solid var(--red, #c0584f); border-radius: 8px; background: var(--field); }
@media (max-width: 640px) { .account-body { padding: 16px; } }
</style>
