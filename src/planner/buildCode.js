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

/** The planner link that opens a build. */
export const plannerHash = (code) => `planner?b=${code}`;
