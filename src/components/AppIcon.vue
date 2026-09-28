<script setup>
const props = defineProps({ name: { type: String, default: "rune" } });
const paths = {
  rune: "M12 3 20 12 12 21 4 12Z M12 7v10 M8 10l8 4",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  book: "M12 5v16 M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z",
  search: "m21 21-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  filter: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
  close: "m6 6 12 12 M6 18 18 6",
  arrow: "M7 17 17 7 M7 7h10v10",
  chevron: "m9 5 7 7-7 7",
  check: "m5 12 4 4 10-10",
  sun: "M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.5 5.5 7 7 M17 17l1.5 1.5 M5.5 18.5 7 17 M17 7l1.5-1.5 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  info: "M12 11v6 M12 7v1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  bag: "M5 7h14l2 14H3Z M8 7V5a4 4 0 0 1 8 0v2",
  crown: "M3 8l4 4 5-7 5 7 4-4-2 11H5Z M5 19h14",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1 M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  gem: "M6 3h12l4 6-10 12L2 9Z M2 9h20 M9 3 7.5 9 12 21 16.5 9 15 3",
  cube: "M12 3 21 8v8l-9 5-9-5V8Z M12 3v8 M21 8l-9 5-9-5 M12 13v8",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z",
  pin: "M9 3h6l-1 6 3 3H7l3-3Z M12 12v9",
  unpin: "M9 3h6l-1 6 3 3H7l3-3Z M12 12v9 M4 4l16 16",
  panel: "M3 4h18v16H3Z M15 4v16",
  save: "M5 3h11l3 3v15H5Z M8 3v5h7V3 M8 14h8v7H8Z",
  builds: "M4 7h13v13H4Z M7 4h13v13 M8 11h5 M8 15h5",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6",
  pencil: "M4 20h4L19 9l-4-4L4 16Z M13 7l4 4",
  bug: "M9 7a3 3 0 0 1 6 0 M7 9h10v5a5 5 0 0 1-10 0Z M12 9v10 M4 12h3 M17 12h3 M5 7l2 2 M19 7l-2 2 M5 19l2-2 M19 19l-2-2",
  idea: "M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3",
  camera: "M4 8h3l2-3h6l2 3h3v11H4Z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
  docs: "M3 5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2H3Z M21 5h-6a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2H21Z",
  // A panel with its left column (the sidebar), and which way it's going.
  collapse: "M4 4h16v16H4Z M9 4v16 M15 9l-3 3 3 3",
  expand: "M4 4h16v16H4Z M9 4v16 M13 9l3 3-3 3",
  backup: "M12 4v11 M8 11l4 4 4-4 M4 15v5h16v-5",
  tree:"M12 3v5 M12 8H6v4 M12 8h6v4 M6 12v4 M18 12v4 M4 16h4v4H4Z M16 16h4v4h-4Z M10 3h4",
};
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[props.name] || paths.rune" />
  </svg>
</template>
