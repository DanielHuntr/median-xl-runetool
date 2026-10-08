<script setup>
import { provide, defineAsyncComponent } from "vue";
import { createRunetool, RunetoolKey } from "./composables/useRunetool.js";
import AppSidebar from "./components/AppSidebar.vue";
import SiteSearch from "./components/SiteSearch.vue";
import AppHeader from "./components/AppHeader.vue";
import AppFooter from "./components/AppFooter.vue";
import ToastHost from "./components/ToastHost.vue";
import RunewordFinder from "./components/RunewordFinder.vue";
import TieredUniques from "./components/TieredUniques.vue";
import SacredUniques from "./components/SacredUniques.vue";
import SetsBrowser from "./components/SetsBrowser.vue";
import OskillsBrowser from "./components/OskillsBrowser.vue";
import SocketablesList from "./components/SocketablesList.vue";
import BaseItems from "./components/BaseItems.vue";
import RuneDrawer from "./components/RuneDrawer.vue";
// Loaded on first visit so the planner code and data stay out of the main bundle.
const CharacterPlanner = defineAsyncComponent(() => import("./components/planner/CharacterPlanner.vue"));
const BuildsBrowser = defineAsyncComponent(() => import("./components/BuildsBrowser.vue"));
const LootFilters = defineAsyncComponent(() => import("./components/LootFilters.vue"));
const CubeRecipes = defineAsyncComponent(() => import("./components/CubeRecipes.vue"));
const ItemUpgrades = defineAsyncComponent(() => import("./components/ItemUpgrades.vue"));
const AccountPage = defineAsyncComponent(() => import("./components/AccountPage.vue"));
const PrivacyPage = defineAsyncComponent(() => import("./components/PrivacyPage.vue"));
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
      <AccountPage v-else-if="page === 'account'" />
      <PrivacyPage v-else-if="page === 'privacy'" />
      <SacredUniques v-else-if="page === 'sacred-uniques'" />
      <SetsBrowser v-else-if="page === 'sets'" />
      <OskillsBrowser v-else-if="page === 'oskills'" />
      <SocketablesList v-else-if="page === 'socketables'" />
      <BaseItems v-else-if="page === 'base-items'" />
      <CubeRecipes v-else-if="page === 'cube'" />
      <ItemUpgrades v-else-if="page === 'upgrades'" />
      <BuildsBrowser v-else-if="page === 'builds'" />
      <LootFilters v-else-if="page === 'filters'" />
      <CharacterPlanner v-else />
      <AppFooter />
      <ToastHost />
    </main>
    <RuneDrawer />
  </div>
</template>
