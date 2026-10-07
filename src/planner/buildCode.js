// A build as a URL-safe code: base64url JSON, versioned. Share links, saved builds and
// preset builds all use it; the planner cleans whatever it decodes (usePlanner cleanBuild).

export function encodeBuild(b) {
  const json = JSON.stringify({ v: 2, ...b });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The raw object in a code, or null. Callers still validate and clean it. */
export function decodeBuild(code) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(String(code).replace(/-/g, "+").replace(/_/g, "/")))));
  } catch {
    return null;
  }
}

// A link to one of the player's own saved builds (&mine=1, with its ids) is trusted only when
// this site's Builds or account page opened it a moment ago. The same link from anywhere else
// opens as a shared build, so a link someone sends can't aim Save at one of the visitor's own
// builds (published builds' ids are public). Kept outside the "mxlrw2:" keys, so a backup file
// can't carry one.
const OWN_KEY = "runetool-own-open";
const bare = (hash) => String(hash || "").replace(/^#/, "");
/** Called as the Builds or account page opens one of the player's builds (its link's href). */
export function markOwnOpen(href) {
  try { localStorage.setItem(OWN_KEY, JSON.stringify({ hash: bare(href), at: Date.now() })); } catch {}
}
/** Whether this link was opened that way (just now); either way, the mark is used up. */
export function takeOwnOpen(hash) {
  try {
    const v = JSON.parse(localStorage.getItem(OWN_KEY));
    localStorage.removeItem(OWN_KEY);
    const age = Date.now() - v.at;
    return v.hash === bare(hash) && age >= 0 && age < 120000;
  } catch {
    return false;
  }
}

/** The planner link that opens a build. */
export const plannerHash = (code) => `planner?b=${code}`;
