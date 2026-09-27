<script setup>
import Icon from "./AppIcon.vue";
import { useRunetool, THEMES } from "../composables/useRunetool.js";
const { theme, page, PAGES } = useRunetool();
import { computed } from "vue";
const THEME_GROUPS = [...new Set(THEMES.map((t) => t[2]))];
const current = computed(() => PAGES.find((p) => p[0] === page.value));
</script>
<template>
  <header class="page-header">
    <div>
      <div class="eyebrow">MEDIAN XL COMPANION</div>
      <h1>{{ current[1] }}</h1>
      <p>{{ current[3] }}</p>
    </div>
    <label class="theme-picker"
      ><Icon name="sun" /><span class="sr-only">Colour theme</span
      ><select v-model="theme">
        <optgroup v-for="g in THEME_GROUPS" :key="g" :label="g">
          <option v-for="[v, label] in THEMES.filter((t) => t[2] === g)" :key="v" :value="v">{{ label }}</option>
        </optgroup>
      </select></label
    >
  </header>
</template>
