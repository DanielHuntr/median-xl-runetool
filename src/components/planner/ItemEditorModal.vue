<script setup>
import { ref, computed, onMounted, nextTick } from "vue";
import Icon from "../AppIcon.vue";
import ItemEditor from "./ItemEditor.vue";
import HoverCard from "./HoverCard.vue";
import { usePlanner } from "../../planner/usePlanner.js";

// The item editor (tier, rolls, sockets) as a modal over the planner.
const { state, closeEditor, gearItem } = usePlanner();
const dialog = ref(null);
const hasItem = computed(() => !!(state.editing && gearItem(state.editing)));

onMounted(async () => {
  dialog.value?.showModal?.();
  await nextTick();
  dialog.value?.querySelector(".item-editor")?.focus({ preventScroll: true });
});
</script>
<template>
  <dialog
    ref="dialog"
    class="item-picker item-editor-modal"
    aria-label="Edit item"
    @cancel.prevent="closeEditor()"
    @click="(e) => e.target === dialog && closeEditor()"
  >
    <div class="picker-content">
      <button class="icon-btn modal-close" aria-label="Close" @click="closeEditor()"><Icon name="close" /></button>
      <ItemEditor v-if="hasItem" :key="state.editing" :slot="state.editing" />
    </div>
    <HoverCard :active="!state.picker" />
  </dialog>
</template>
