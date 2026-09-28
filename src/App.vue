<script setup>
import { provide, defineAsyncComponent } from "vue";
import { createRunetool, RunetoolKey } from "./composables/useRunetool.js";
import AppSidebar from "./components/AppSidebar.vue";
import SiteSearch from "./components/SiteSearch.vue";
import AppHeader from "./components/AppHeader.vue";
import AppFooter from "./components/AppFooter.vue";
import RunewordFinder from "./components/RunewordFinder.vue";
import TieredUniques from "./components/TieredUniques.vue";
import SacredUniques from "./components/SacredUniques.vue";
import SetsBrowser from "./components/SetsBrowser.vue";
import SocketablesList from "./components/SocketablesList.vue";
import BaseItems from "./components/BaseItems.vue";
import RuneDrawer from "./components/RuneDrawer.vue";
// Loaded on first visit so the planner code and data stay out of the main bundle.
const CharacterPlanner = defineAsyncComponent(() => import("./components/planner/CharacterPlanner.vue"));
const ConfirmValues = defineAsyncComponent(() => import("./components/ConfirmValues.vue"));
const BuildsBrowser = defineAsyncComponent(() => import("./components/BuildsBrowser.vue"));
const LootFilters = defineAsyncComponent(() => import("./components/LootFilters.vue"));
const CubeRecipes = defineAsyncComponent(() => import("./components/CubeRecipes.vue"));
const state = createRunetool();
provide(RunetoolKey, state);
const { page } = state;
</script>
<template>
  <div class="app-shell">
    <AppSidebar />
    <SiteSearch />
    <main>
      <AppHeader />
      <RunewordFinder v-if="page === 'runewords'" />
      <TieredUniques v-else-if="page === 'uniques'" />
      <SacredUniques v-else-if="page === 'sacred-uniques'" />
      <SetsBrowser v-else-if="page === 'sets'" />
      <SocketablesList v-else-if="page === 'socketables'" />
      <BaseItems v-else-if="page === 'base-items'" />
      <CubeRecipes v-else-if="page === 'cube'" />
      <ConfirmValues v-else-if="page === 'confirm'" />
      <BuildsBrowser v-else-if="page === 'builds'" />
      <LootFilters v-else-if="page === 'filters'" />
      <CharacterPlanner v-else />
      <AppFooter />
    </main>
    <RuneDrawer />
  </div>
</template>
