// Run in DevTools Console on your new local/Vercel Runetool domain.
// Choose a JSON file created by export-browser-state.js. Replaces this app's saved preferences only.
(() => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = async () => {
    try {
      if (!input.files[0]) return;
      const payload = JSON.parse(await input.files[0].text());
      if (payload.format !== "median-xl-runetool" || payload.version !== 1)
        throw new Error("Not a Runetool backup.");
      const { state, owned, stars, theme } = payload.data;
      if (
        state !== null &&
        (!state ||
          typeof state !== "object" ||
          !["sockets", "tags", "elems"].every((k) => Array.isArray(state[k])))
      )
        throw new Error("Invalid filter state.");
      if (
        owned !== null &&
        (!owned ||
          Array.isArray(owned) ||
          typeof owned !== "object" ||
          Object.values(owned).some((n) => ![0, 1, 2].includes(n)))
      )
        throw new Error("Invalid rune inventory.");
      if (
        stars !== null &&
        (!Array.isArray(stars) || stars.some((s) => typeof s !== "string"))
      )
        throw new Error("Invalid favourites.");
      if (theme !== null && !["auto", "light", "dark", "hc"].includes(theme))
        throw new Error("Invalid theme.");
      if (payload.data['saved-builds'] != null && !Array.isArray(payload.data['saved-builds']))
        throw new Error("Invalid saved builds.");
      for (const key of ["state", "owned", "stars", "theme", "planner", "saved-builds"]) {
        if (payload.data[key] != null)
          localStorage.setItem(
            `mxlrw2:${key}`,
            JSON.stringify(payload.data[key]),
          );
      }
      location.reload();
    } catch (error) {
      alert(`Could not import Runetool state: ${error.message}`);
    }
  };
  input.click();
})();
