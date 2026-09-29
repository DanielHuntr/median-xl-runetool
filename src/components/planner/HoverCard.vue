<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import ItemSheet from "./ItemSheet.vue";
import SkillSheet from "./SkillSheet.vue";
import { usePlanner } from "../../planner/usePlanner.js";

// Floating sheet beside whatever is hovered: right of it when there's room, else left,
// kept inside the viewport vertically. Modal dialogs sit in the browser's top layer, so
// each dialog renders its own HoverCard and only the topmost one is active.
// Alt pins it where it is, so the pointer can move onto it (an item's unused lines open there,
// each with why); it stays while the pointer is over the item or the sheet, and Esc or moving
// away closes it.
const props = defineProps({ active: { type: Boolean, default: true } });
const { state, hideTip } = usePlanner();
const el = ref(null);
const pos = ref({ left: 0, top: 0, visible: false });
const pinned = computed(() => state.tipPinned);

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
// A pinned sheet that grows (its unused lines opened) moves up to stay on screen.
let resize = null;
function fit() {
  const box = el.value?.getBoundingClientRect();
  if (!box || !pos.value.visible) return;
  const top = Math.min(pos.value.top, Math.max(8, window.innerHeight - box.height - 8));
  if (top !== pos.value.top) pos.value = { ...pos.value, top };
}
watch(el, (node, old) => {
  if (old) resize?.unobserve(old);
  if (node && typeof ResizeObserver !== "undefined") (resize ??= new ResizeObserver(fit)).observe(node);
});
function onKey(e) {
  if (e.key === "Escape") return hideTip();
  if (e.key !== "Alt" || !props.active || !state.tip) return;
  // Alt alone would focus the browser's menu bar (Firefox) on release.
  e.preventDefault();
  state.tipPinned = true;
}
const onKeyUp = (e) => { if (e.key === "Alt" && state.tipPinned) e.preventDefault(); };
// A pinned sheet stays while the pointer is over the item, the sheet or the gap between them
// (the box around both), and closes when it moves out of that.
const PAD = 8;
function onMove(e) {
  if (!state.tipPinned || !state.tip) return;
  const card = el.value?.getBoundingClientRect(), anchor = state.tip.rect;
  if (!card) return;
  const left = Math.min(card.left, anchor.left) - PAD, right = Math.max(card.right, anchor.right) + PAD;
  const top = Math.min(card.top, anchor.top) - PAD, bottom = Math.max(card.bottom, anchor.bottom) + PAD;
  if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) hideTip();
}
// The anchor moves when the page scrolls, so an unpinned sheet closes rather than drifting; a
// pinned one is being read, and stays.
const onScroll = () => { if (!state.tipPinned) hideTip(); };
onMounted(() => {
  window.addEventListener("keydown", onKey);
  document.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("pointermove", onMove, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  document.removeEventListener("scroll", onScroll, { capture: true });
  window.removeEventListener("keyup", onKeyUp);
  document.removeEventListener("pointermove", onMove);
  resize?.disconnect();
});
</script>
<template>
  <div
    v-if="active && state.tip"
    ref="el"
    id="planner-tip"
    :role="pinned ? 'dialog' : 'tooltip'"
    :aria-label="pinned ? 'Pinned item details' : undefined"
    class="hover-card"
    :class="{ pinned }"
    :style="{ left: pos.left + 'px', top: pos.top + 'px', visibility: pos.visible ? 'visible' : 'hidden' }"
  >
    <ItemSheet v-if="state.tip.kind === 'item'" :item="state.tip.item" :pinned="pinned" />
    <SkillSheet v-else-if="state.tip.kind === 'skill'" :id="state.tip.id" />
  </div>
</template>
