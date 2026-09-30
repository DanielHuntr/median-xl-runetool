<script setup>
import { computed, ref, watch } from "vue";
import Icon from "./AppIcon.vue";
import BackupDialog from "./BackupDialog.vue";
import { useRunetool, ISSUES_REPO } from "../composables/useRunetool.js";
const { page, nav, PAGES } = useRunetool();
// The sidebar can be collapsed to icons (remembered); icons then show their names on hover.
const collapsed = ref((() => { try { return localStorage.getItem("mxlrw2:nav-collapsed") === "1"; } catch { return false; } })());
watch(collapsed, (v) => {
  try { localStorage.setItem("mxlrw2:nav-collapsed", v ? "1" : "0"); } catch {}
  if (typeof document !== "undefined") document.documentElement.classList?.toggle("nav-collapsed", v);
}, { immediate: true });
// Phones: a slim top bar (brand, search, and a menu button) instead of the sidebar. The menu
// is a drawer listing every page with what it's for, and the links from the sidebar's foot.
const docsLabel = computed(() => (page.value === "filters" ? "Filter Exchange" : ["planner", "builds"].includes(page.value) ? "Skill data source" : "Game documentation"));
const sheet = ref(null);
const menuOpen = ref(false);
const backup = ref(null);
const openSearch = () => {
  closeMore();
  window.dispatchEvent(new Event("site-search"));
};
const searchKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘K" : "Ctrl K";
function openBackup() {
  closeMore();
  backup.value?.open();
}
const openMore = () => { sheet.value?.showModal(); menuOpen.value = true; };
const closeMore = () => sheet.value?.close();
function go(id) {
  closeMore();
  nav(id);
}
// Bug reports open a GitHub issue form (.github/ISSUE_TEMPLATE/bug_report.yml) with the
// page, version and browser filled in.
const APP_VERSION = __APP_VERSION__;
// Ideas go to their own form (.github/ISSUE_TEMPLATE/suggestion.yml), so they don't arrive as bugs.
function suggestHref() {
  const title = PAGES.find((p) => p[0] === page.value)?.[1] || page.value;
  const q = new URLSearchParams({ template: "suggestion.yml", title: `[Suggestion] `, page: title, version: APP_VERSION });
  return `${ISSUES_REPO}/issues/new?${q}`;
}
function reportHref() {
  const title = PAGES.find((p) => p[0] === page.value)?.[1] || page.value;
  const q = new URLSearchParams({
    template: "bug_report.yml",
    title: `[${title}] `,
    page: `${title} (${location.href.split("?")[0]})`,
    version: APP_VERSION,
    browser: navigator.userAgent,
  });
  return `${ISSUES_REPO}/issues/new?${q}`;
}
</script>
<template>
  <aside class="sidebar" :class="{ collapsed }">
    <a class="brand" href="#runewords" @click.prevent="nav('runewords')"
      ><span class="brand-mark"><Icon name="rune" /></span
      ><span>MEDIAN XL<small>R U N E T O O L</small></span></a
    >
    <button type="button" class="nav-search" aria-label="Search the site" :data-tip="`Search (${searchKey})`" @click="openSearch">
      <Icon name="search" /><span>Search</span><kbd>{{ searchKey }}</kbd>
    </button>
    <div class="nav-label">THE ARMORY</div>
    <nav aria-label="Main navigation">
      <button
        v-for="[id, title, icon] in PAGES.filter((p) => !p[5])"
        :key="id"
        :aria-label="title"
        :data-tip="title"
        :class="{ selected: page === id }"
        :aria-current="page === id ? 'page' : undefined"
        @click="nav(id)"
      >
        <Icon :name="icon" /><span>{{ title }}</span>
      </button>
    </nav>
    <div class="sidebar-bottom">
      <div class="version" data-tip="Median XL 2.14 · supplied data version">
        Σ <span>Median XL 2.14<small>Supplied data version</small></span>
      </div>
      <a class="side-link" :href="`${ISSUES_REPO}/issues/new/choose`" target="_blank" rel="noopener" data-tip="Report a bug or issue" @click="(e) => (e.currentTarget.href = reportHref())"><Icon name="bug" /><span>Report a bug or issue</span></a>
      <a class="side-link" :href="`${ISSUES_REPO}/issues/new/choose`" target="_blank" rel="noopener" data-tip="Suggest an idea" @click="(e) => (e.currentTarget.href = suggestHref())"><Icon name="idea" /><span>Suggest an idea</span></a>
      <button type="button" class="side-link" data-tip="Back up &amp; restore" @click="openBackup"><Icon name="backup" /><span>Back up &amp; restore</span></button>
      <a class="side-link" :href="PAGES.find((p) => p[0] === page)[4]" target="_blank" rel="noopener" :data-tip="docsLabel"><Icon name="docs" /><span>{{ docsLabel }}</span></a>
      <button type="button" class="side-link side-collapse" :aria-pressed="collapsed" :data-tip="collapsed ? 'Expand the menu' : 'Collapse the menu'" @click="collapsed = !collapsed">
        <Icon :name="collapsed ? 'expand' : 'collapse'" /><span>Collapse menu</span>
      </button>
    </div>
  </aside>
  <header class="mobile-top">
    <button type="button" class="icon-btn mobile-menu" aria-label="Menu" aria-haspopup="dialog" :aria-expanded="menuOpen" @click="openMore">
      <Icon name="menu" />
    </button>
    <a class="mobile-brand" href="#runewords" @click.prevent="nav('runewords')"
      ><span class="brand-mark"><Icon name="rune" /></span
      ><span>{{ PAGES.find((p) => p[0] === page)?.[1] || "Median XL Runetool" }}</span></a
    >
    <button type="button" class="icon-btn" aria-label="Search the site" @click="openSearch"><Icon name="search" /></button>
  </header>
  <dialog ref="sheet" class="mobile-sheet" aria-labelledby="mobile-sheet-title" @close="menuOpen = false" @click="(e) => { if (e.target === sheet) closeMore(); }">
    <div class="mobile-sheet-body">
      <header>
        <b id="mobile-sheet-title">Median XL Runetool</b>
        <button type="button" class="icon-btn" aria-label="Search the site" @click="openSearch"><Icon name="search" /></button>
        <button type="button" class="icon-btn" aria-label="Close" @click="closeMore"><Icon name="close" /></button>
      </header>
      <ul>
        <li v-for="[id, title, icon, desc] in PAGES.filter((p) => !p[5])" :key="id">
          <button type="button" :class="{ selected: page === id }" :aria-current="page === id ? 'page' : undefined" @click="go(id)">
            <Icon :name="icon" />
            <span><b>{{ title }}</b><small>{{ desc }}</small></span>
          </button>
        </li>
      </ul>
      <div class="mobile-sheet-links">
        <a href="#" @click.prevent="openBackup">Back up &amp; restore <Icon name="backup" /></a>
        <a :href="`${ISSUES_REPO}/issues/new/choose`" target="_blank" rel="noopener" @click="(e) => (e.currentTarget.href = reportHref())">Report a bug or issue <Icon name="arrow" /></a>
        <a :href="`${ISSUES_REPO}/issues/new/choose`" target="_blank" rel="noopener" @click="(e) => (e.currentTarget.href = suggestHref())">Suggest an idea <Icon name="arrow" /></a>
        <a :href="PAGES.find((p) => p[0] === page)[4]" target="_blank" rel="noopener">Game documentation <Icon name="arrow" /></a>
      </div>
    </div>
  </dialog>
  <BackupDialog ref="backup" />
</template>
