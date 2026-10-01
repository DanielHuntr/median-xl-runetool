<script setup>
// The privacy policy: what the site keeps, where, and how to remove it. Keep it in step with
// what accounts store (supabase/migrations) and what the browser keeps (savedBuilds.js, backup).
import { ISSUES_REPO } from "../composables/useRunetool.js";
const UPDATED = "1 October 2026";
</script>
<template>
  <article class="privacy">
    <p class="muted">Last updated {{ UPDATED }}</p>

    <h2>Without an account</h2>
    <p>Everything you save (builds, loot filters, rune inventory, favourites, theme and other settings) stays in this browser, on your device. It isn't sent to us. Clearing your browser's site data removes it; Back up &amp; restore lets you keep a copy.</p>

    <h2>With an account</h2>
    <p>You sign in with Google. We receive and keep:</p>
    <ul>
      <li>your name, email address and profile picture from Google, used only to sign you in and to show you who you're signed in as. They are never shown to other players;</li>
      <li>the display name you choose, shown on builds you publish;</li>
      <li>the builds you save to your account: private until you publish them, then visible to anyone on the Builds page with your display name;</li>
      <li>the loot filters you save to your account, which only you can see;</li>
      <li>the community builds you like: others see only how many likes a build has, never who liked it.</li>
    </ul>
    <p>Accounts, account builds and filters are stored by Supabase, our database and sign-in provider. We don't sell your data, show ads or use tracking cookies. Signing in keeps a session in your browser's storage so you stay signed in.</p>

    <h2>Deleting your data</h2>
    <p>Your account page lets you delete any build or loot filter, or your whole account: that removes your login, display name and every build and filter saved to it, straight away. Builds and filters saved only in your browser stay there until you clear them.</p>

    <h2>Questions</h2>
    <p>Ask us through the site's <a :href="`${ISSUES_REPO}/issues/new/choose`" target="_blank" rel="noopener">GitHub issues</a>.</p>
  </article>
</template>
<style scoped>
.privacy { max-width: 760px; padding: 0 24px 32px; line-height: 1.6; }
.privacy h2 { margin: 24px 0 8px; color: var(--gold); font-family: var(--serif); font-size: 1.2rem; }
.privacy p, .privacy li { font-size: .9375rem; }
.privacy ul { padding-left: 20px; }
@media (max-width: 600px) { .privacy { padding: 0 12px 24px; } }
</style>
