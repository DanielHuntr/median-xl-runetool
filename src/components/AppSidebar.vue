<script setup>
import Icon from "./AppIcon.vue";
import { useRunetool, ISSUES_REPO } from "../composables/useRunetool.js";
const { page, nav, PAGES } = useRunetool();
// Bug reports open a GitHub issue form (.github/ISSUE_TEMPLATE/bug_report.yml) with the
// page, version and browser filled in.
const APP_VERSION = __APP_VERSION__;
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
  <aside class="sidebar">
    <a class="brand" href="#runewords" @click.prevent="nav('runewords')"
      ><span class="brand-mark"><Icon name="rune" /></span
      ><span>MEDIAN XL<small>R U N E T O O L</small></span></a
    >
    <div class="nav-label">THE ARMORY</div>
    <nav aria-label="Main navigation">
      <button
        v-for="[id, title, icon] in PAGES.filter((p) => !p[5])"
        :key="id"
        :aria-label="title"
        :title="title"
        :class="{ selected: page === id }"
        :aria-current="page === id ? 'page' : undefined"
        @click="nav(id)"
      >
        <Icon :name="icon" /><span>{{ title }}</span>
      </button>
    </nav>
    <div class="sidebar-bottom">
      <div class="version">
        Σ <span>Median XL 2.14<small>Supplied data version</small></span>
      </div>
      <a class="report-link" :href="`${ISSUES_REPO}/issues/new/choose`" target="_blank" rel="noopener" @click="(e) => (e.currentTarget.href = reportHref())">Report a bug or issue <Icon name="arrow" /></a>
      <a class="report-link" href="#confirm" :aria-current="page === 'confirm' ? 'page' : undefined" @click.prevent="nav('confirm')">Help confirm values <Icon name="check" /></a>
      <a
        :href="PAGES.find((p) => p[0] === page)[4]"
        target="_blank"
        rel="noopener"
        >{{ ['planner', 'confirm', 'builds'].includes(page) ? "Skill data source" : "Game documentation" }} <Icon name="arrow"
      /></a>
    </div>
  </aside>
</template>
