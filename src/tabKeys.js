// Keyboard for role="tablist" (the WAI-ARIA tabs pattern): the arrow keys, Home and End move
// to another tab and select it. Put @keydown="tabKeys" on the tablist, and give only the
// selected tab tabindex 0 (the others -1) so Tab leaves the list in one step.
const NEXT = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function tabKeys(e) {
  const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')];
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  let to;
  if (e.key in NEXT) to = (i + NEXT[e.key] + tabs.length) % tabs.length;
  else if (e.key === "Home") to = 0;
  else if (e.key === "End") to = tabs.length - 1;
  else return;
  e.preventDefault();
  tabs[to].focus();
  tabs[to].click();
}
