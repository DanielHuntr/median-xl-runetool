<script setup>
import Icon from "./AppIcon.vue";
import { useRunetool } from "../composables/useRunetool.js";
import DataStatus from "./DataStatus.vue";
const LIVE = ["sacred-uniques", "sets", "socketables", "base-items"];
const { page, PAGES } = useRunetool();
</script>
<template>
  <footer>
    <p v-if="page === 'runewords' || page === 'socketables'">
      <Icon name="info" />Runewords only work in grey (non-magic) socketed
      items. Extra sockets can be filled with jewels before adding the runes.
    </p>
    <div>
      <span v-if="page === 'planner' || page === 'confirm'"
        >Skill data from
        <a :href="PAGES.find((p) => p[0] === page)[4]" target="_blank" rel="noopener"
          >medianxl-db (MIT) <Icon name="arrow" /></a
        >.</span
      ><span v-else
        >Data sourced from
        <a
          :href="PAGES.find((p) => p[0] === page)[4]"
          target="_blank"
          rel="noopener"
          >Median XL documentation <Icon name="arrow" /></a
        >.</span
      ><span v-if="LIVE.includes(page)"><DataStatus /></span
      ><span v-else-if="page !== 'planner' && page !== 'confirm'"
        >Item data refreshed from the official documentation · 25 September
        2026.</span
      >
    </div>
  </footer>
</template>
