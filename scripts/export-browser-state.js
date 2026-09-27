// Run in DevTools Console on your existing Runetool domain.
// Exports only this app's preferences, favourites, rune inventory and builds.
(() => {
  const keys = ["state", "owned", "stars", "theme", "planner", "saved-builds"];
  const data = Object.fromEntries(
    keys.map((key) => [
      key,
      JSON.parse(localStorage.getItem(`mxlrw2:${key}`) || "null"),
    ]),
  );
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { format: "median-xl-runetool", version: 1, data },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "median-xl-runetool-state.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
})();
