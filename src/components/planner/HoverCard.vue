<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import ItemSheet from "./ItemSheet.vue";
import SkillSheet from "./SkillSheet.vue";
import { usePlanner } from "../../planner/usePlanner.js";

// Floating sheet beside whatever is hovered: right of it when there's room, else left,
// kept inside the viewport vertically. Modal dialogs sit in the browser's top layer, so
// each dialog renders its own HoverCard and only the topmost one is active.
const props = defineProps({ active: { type: Boolean, default: true } });
const { state, hideTip } = usePlanner();
const el = ref(null);
const pos = ref({ left: 0, top: 0, visible: false });

async function place() {
  const tip = state.tip;
  if (!tip) return;
  pos.value = { ...pos.value, visible: false };
  await nextTick();
  const box = el.value?.getBoundingClientRect();
  if (!box) return;
  const gap = 12;
  const { rect } = tip;
  let left = rect.right + gap;
  if (left + box.width > window.innerWidth - 8) left = Math.max(8, rect.left - box.width - gap);
  const top = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - box.height - 8));
  pos.value = { left, top, visible: true };
}
watch(() => state.tip, place);
const onKey = (e) => e.key === "Escape" && hideTip();
// The anchor moves when the page scrolls, so the sheet closes rather than drifting.
onMounted(() => {
  window.addEventListener("keydown", onKey);
  document.addEventListener("scroll", hideTip, { passive: true, capture: true });
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  document.removeEventListener("scroll", hideTip, { capture: true });
});
</script>
<template>
  <div
    v-if="active && state.tip"
    ref="el"
    id="planner-tip"
    role="tooltip"
    class="hover-card"
    :style="{ left: pos.left + 'px', top: pos.top + 'px', visibility: pos.visible ? 'visible' : 'hidden' }"
  >
    <ItemSheet v-if="state.tip.kind === 'item'" :item="state.tip.item" />
    <SkillSheet v-else-if="state.tip.kind === 'skill'" :id="state.tip.id" />
  </div>
</template>
