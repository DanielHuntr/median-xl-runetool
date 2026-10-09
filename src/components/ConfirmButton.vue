<script setup>
// A button for something that can't be undone: the first press asks in place ("Delete this
// filter? Delete · Cancel") instead of a browser pop-up, the second does it. Escape, Cancel or
// moving focus away puts the button back.
import { ref, nextTick, watch, onBeforeUnmount } from "vue";

const props = defineProps({
  // The question shown in place of the button.
  question: { type: String, required: true },
  // The confirming button's word ("Delete", "Reset").
  confirmLabel: { type: String, default: "Delete" },
  btnClass: { type: String, default: "btn" },
});
const emit = defineEmits(["confirm"]);
const asking = ref(false);
const root = ref(null);
async function ask() {
  asking.value = true;
  await nextTick();
  root.value?.querySelector(".confirm-cancel")?.focus();
}
function cancel() {
  asking.value = false;
}
function confirm() {
  asking.value = false;
  emit("confirm");
}
// Focus moving elsewhere (Tab past it) or a press outside it cancels the question. (The button
// itself leaving as the question replaces it isn't focus moving elsewhere.)
function left(e) {
  if (e.relatedTarget && !root.value?.contains(e.relatedTarget)) cancel();
}
const outside = (e) => { if (!root.value?.contains(e.target)) cancel(); };
watch(asking, (on) => (on ? document.addEventListener("pointerdown", outside, true) : document.removeEventListener("pointerdown", outside, true)));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside, true));
</script>
<template>
  <span ref="root" class="confirm-button" @keydown.esc.stop="cancel" @focusout="left">
    <button v-if="!asking" type="button" :class="btnClass" v-bind="$attrs" @click="ask"><slot /></button>
    <span v-else class="confirm-ask" role="group" :aria-label="question">
      <span class="confirm-question">{{ question }}</span>
      <span class="confirm-actions">
        <button type="button" class="btn danger confirm-yes" @click="confirm">{{ props.confirmLabel }}</button>
        <button type="button" class="btn confirm-cancel" @click="cancel">Cancel</button>
      </span>
    </span>
  </span>
</template>
<script>
export default { inheritAttrs: false };
</script>
