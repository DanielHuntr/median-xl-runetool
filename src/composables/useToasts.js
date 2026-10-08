// Toasts: short messages that slide in at the bottom of the screen and leave on their own
// (ToastHost.vue shows them, over any open dialog). One can carry an action, such as Undo for
// a change that happened at once instead of asking first.
import { reactive } from "vue";

export const toasts = reactive([]);
let next = 1;
const timers = new Map();
const MAX = 3;

/**
 * Shows a toast. tone: "info" (done) or "warn" (something stopped it).
 * action: { label, run } — a button on the toast; the toast closes once it's used.
 * @returns the toast's id
 */
export function toast(message, { tone = "info", action = null, duration } = {}) {
  if (!message) return null;
  // The same message again (a button pressed twice) restarts its timer instead of stacking.
  const same = toasts.find((t) => t.message === message && t.tone === tone && !t.action && !action);
  if (same) {
    arm(same);
    return same.id;
  }
  const t = { id: next++, message, tone, action, duration: duration ?? (action ? 7000 : tone === "warn" ? 6000 : 4000) };
  toasts.push(t);
  while (toasts.length > MAX) dismiss(toasts[0].id);
  arm(t);
  return t.id;
}
function arm(t) {
  clearTimeout(timers.get(t.id));
  timers.set(t.id, setTimeout(() => dismiss(t.id), t.duration));
}
export function dismiss(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}
// Hovering or focusing a toast keeps it until the pointer or focus leaves.
export const hold = (id) => clearTimeout(timers.get(id));
export const release = (id) => {
  const t = toasts.find((x) => x.id === id);
  if (t) arm(t);
};
export function runAction(t) {
  dismiss(t.id);
  t.action?.run();
}
