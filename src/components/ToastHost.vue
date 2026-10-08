<script setup>
// Where toasts show (composables/useToasts.js). A modal dialog sits above the page and makes the
// rest of it inert, so the toasts move into the topmost open dialog while there is one: a
// change made in the item editor shows its Undo there, where it can be pressed.
import { ref, watch, onBeforeUnmount } from "vue";
import Icon from "./AppIcon.vue";
import { toasts, dismiss, hold, release, runAction } from "../composables/useToasts.js";

const target = ref("body");
const topDialog = () => [...document.querySelectorAll("dialog[open]")].filter((d) => d.matches(":modal")).at(-1) || "body";
let timer = null;
function follow() {
  const t = topDialog();
  if (t !== target.value) target.value = t;
}
// While toasts are up, follow dialogs opening and closing.
watch(
  () => toasts.length,
  (n) => {
    follow();
    if (n && !timer) timer = setInterval(follow, 250);
    if (!n && timer) {
      clearInterval(timer);
      timer = null;
    }
  },
);
onBeforeUnmount(() => clearInterval(timer));
</script>
<template>
  <Teleport :to="target">
    <div class="toast-host" role="status" aria-live="polite">
      <TransitionGroup name="toast" tag="ul" class="toast-list">
        <li
          v-for="t in toasts"
          :key="t.id"
          class="toast"
          :class="t.tone"
          @mouseenter="hold(t.id)"
          @mouseleave="release(t.id)"
          @focusin="hold(t.id)"
          @focusout="release(t.id)"
        >
          <span class="toast-dot" aria-hidden="true"></span>
          <span class="toast-message">{{ t.message }}</span>
          <button v-if="t.action" type="button" class="toast-action" @click="runAction(t)">{{ t.action.label }}</button>
          <button type="button" class="toast-close" aria-label="Dismiss" @click="dismiss(t.id)"><Icon name="close" /></button>
        </li>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
