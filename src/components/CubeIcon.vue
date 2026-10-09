<script setup>
// An item picture in a square box (a recipe ingredient or result), with a count, an "any"
// mark for "any item of this type", or a portal for a portal result. The label is the
// caller's, so a picture always has words next to it.
import ItemSprite from "./ItemSprite.vue";
import Icon from "./AppIcon.vue";
defineProps({ art: { type: String, default: null }, qty: { type: Number, default: 1 }, any: Boolean, portal: Boolean, size: { type: Number, default: 44 }, missing: Boolean });
</script>
<template>
  <span class="cube-icon" :class="{ any, missing, portal }" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <ItemSprite v-if="art" :name="art" class="cube-icon-art" />
    <span v-else-if="portal" class="cube-icon-portal"></span>
    <Icon v-else name="cube" class="cube-icon-none" />
    <b v-if="qty > 1" class="cube-icon-qty">×{{ qty }}</b>
    <i v-if="any" class="cube-icon-any">any</i>
  </span>
</template>
<style scoped>
.cube-icon { position: relative; display: inline-grid; place-items: center; flex-shrink: 0; border: 1px solid var(--soft-border); border-radius: 6px; background: radial-gradient(circle at 50% 40%, var(--raised), var(--field)); }
.cube-icon.any { border-style: dashed; }
.cube-icon.missing { opacity: 0.55; border-style: dashed; border-color: var(--gold); }
.cube-icon-art { max-width: 80%; max-height: 86%; width: auto; height: auto; image-rendering: pixelated; }
.cube-icon-none { width: 45%; color: var(--muted); }
.cube-icon-portal { width: 60%; height: 80%; border-radius: 50% / 45%; background: radial-gradient(ellipse at center, #9fd6ff 0%, #3a78c9 45%, #1b2c6b 75%, transparent 76%); box-shadow: 0 0 10px #4b8fe066; }
.cube-icon-qty { position: absolute; right: 2px; bottom: 1px; padding: 0 3px; border-radius: 3px; background: #000a; color: #fff; font-size: 0.75rem; line-height: 1.3; }
.cube-icon-any { position: absolute; left: 2px; top: 1px; color: var(--muted); font-size: 0.6875rem; font-style: normal; text-transform: uppercase; letter-spacing: 0.04em; }
</style>
