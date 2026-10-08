<script setup>
import Icon from "./AppIcon.vue";
import ThemePicker from "./ThemePicker.vue";
import WhatsNew from "./WhatsNew.vue";
import { useRunetool } from "../composables/useRunetool.js";
const { page, PAGES } = useRunetool();
import { computed } from "vue";
const current = computed(() => PAGES.find((p) => p[0] === page.value));
</script>
<template>
  <header class="page-header">
    <div>
      <div class="eyebrow">MEDIAN XL COMPANION</div>
      <h1>{{ current[1] }}</h1>
      <p>{{ current[3] }}</p>
    </div>
    <div class="page-header-tools"><WhatsNew /><ThemePicker /></div>
  </header>
</template>
