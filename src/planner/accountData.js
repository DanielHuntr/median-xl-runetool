// The signed-in player's data in Supabase: their profile (display name) and the builds saved to
// their account. Row Level Security (supabase/migrations) limits every call to their own rows,
// plus other players' published builds. Each function resolves to { ok, ... } or
// { ok: false, reason } with a message fit to show.
import { supabase } from "../lib/supabase.js";

const fail = (error) => ({
  ok: false,
  // A table the site expects isn't in the database yet (a migration not run): said plainly.
  reason: error?.code === "PGRST205" || /schema cache/i.test(error?.message || "")
    ? "Saving this to your account isn't available yet. Please try again later."
    : error?.message || "Something went wrong. Please try again.",
});
export const DISPLAY_NAME = /^[A-Za-z0-9 _-]{3,24}$/;

export async function getProfile(userId) {
  const { data, error } = await (await supabase()).from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return error ? fail(error) : { ok: true, displayName: data?.display_name || "" };
}

export async function saveDisplayName(userId, name) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  if (!DISPLAY_NAME.test(clean)) return { ok: false, reason: "Use 3 to 24 letters, numbers, spaces, _ or -." };
  const { error } = await (await supabase()).from("profiles").upsert({ id: userId, display_name: clean });
  if (error?.code === "23505") return { ok: false, reason: "That name is taken. Try another." };
  return error ? fail(error) : { ok: true, displayName: clean };
}

export async function listMyBuilds(userId) {
  const { data, error } = await (await supabase()).from("builds")
    .select("id, name, cls, level, code, skills, published, updated_at").eq("user_id", userId).order("updated_at", { ascending: false });
  return error ? fail(error) : { ok: true, builds: data };
}

/** Adds builds (as saved in this browser: { name, cls, level, code, skills }) to the account. */
export async function addBuilds(list) {
  const rows = list.map(({ name, cls, level, code, skills }) => ({ name, cls, level: level ?? null, code, skills: skills || [] }));
  const { error } = await (await supabase()).from("builds").insert(rows);
  return error ? fail(error) : { ok: true };
}

export async function updateBuild(id, changes) {
  const { error } = await (await supabase()).from("builds").update(changes).eq("id", id);
  return error ? fail(error) : { ok: true };
}

export async function deleteBuild(id) {
  const { error } = await (await supabase()).from("builds").delete().eq("id", id);
  return error ? fail(error) : { ok: true };
}

/** Deletes the account and everything in it (supabase/migrations: delete_my_account), then signs out. */
export async function deleteAccount() {
  const sb = await supabase();
  const { error } = await sb.rpc("delete_my_account");
  if (error) return fail(error);
  await sb.auth.signOut();
  return { ok: true };
}

/**
 * Saves a build to the account: replaces the player's own build with the same name (as saving
 * in this browser does), otherwise adds it. published: true shares it on the Builds page.
 */
export async function saveToAccount(userId, { name, cls, level, code, skills }, { published = false, id = "" } = {}) {
  const sb = await supabase();
  const row = { name, cls, level: level ?? null, code, skills: skills || [], published };
  // The account build this one is (opened from it, or saved to it before): updated, renamed.
  if (id) {
    const { data, error } = await sb.from("builds").update(row).eq("id", id).eq("user_id", userId).select("id");
    if (error) return fail(error);
    if (data?.length) return { ok: true, id, replaced: true };
  }
  const { data: same, error: findError } = await sb.from("builds").select("id").eq("user_id", userId).eq("name", name).limit(1);
  if (findError) return fail(findError);
  if (same?.length) {
    const { error } = await sb.from("builds").update(row).eq("id", same[0].id);
    return error ? fail(error) : { ok: true, id: same[0].id, replaced: true };
  }
  const { data, error } = await sb.from("builds").insert(row).select("id").single();
  return error ? fail(error) : { ok: true, id: data.id, replaced: false };
}

/** Whether one of the player's account builds is published (and that it still exists and is
 *  theirs: other players' published builds are readable too, so the owner is checked). */
export async function getMyBuild(id, userId) {
  const { data, error } = await (await supabase()).from("builds").select("id, name, published").eq("id", id).eq("user_id", userId).maybeSingle();
  return error ? fail(error) : { ok: true, build: data };
}

/** Published builds, newest or most liked first, each with its author's display name. */
export async function listPublished({ cls = "", sort = "new", limit = 60 } = {}) {
  const sb = await supabase();
  const query = (likes) => {
    let q = sb.from("builds").select(`id, user_id, name, cls, level, code, skills, ${likes ? "likes, " : ""}updated_at`).eq("published", true);
    if (likes && sort === "liked") q = q.order("likes", { ascending: false });
    q = q.order("updated_at", { ascending: false }).limit(limit);
    return cls ? q.eq("cls", cls) : q;
  };
  let { data, error } = await query(true);
  // Before the likes migration has run (no likes column): the list without counts.
  if (error?.code === "42703") ({ data, error } = await query(false));
  if (error) return fail(error);
  const ids = [...new Set(data.map((b) => b.user_id))];
  const names = new Map();
  if (ids.length) {
    const { data: profiles } = await sb.from("profiles").select("id, display_name").in("id", ids);
    for (const p of profiles || []) names.set(p.id, p.display_name);
  }
  return { ok: true, builds: data.map((b) => ({ ...b, author: names.get(b.user_id) || "A player" })) };
}

// ---------- Loot filters saved to the account (private to their owner).
export async function listMyFilters(userId) {
  const { data, error } = await (await supabase()).from("loot_filters")
    .select("id, name, filter, updated_at").eq("user_id", userId).order("updated_at", { ascending: false });
  return error ? fail(error) : { ok: true, filters: data };
}

/** Adds a filter ({ name, default_show_items, rules }); resolves to { ok, id }. */
export async function addFilter(filter) {
  const { data, error } = await (await supabase()).from("loot_filters").insert({ name: filter.name, filter }).select("id").single();
  return error ? fail(error) : { ok: true, id: data.id };
}

export async function updateFilter(id, filter) {
  const { error } = await (await supabase()).from("loot_filters").update({ name: filter.name, filter }).eq("id", id);
  return error ? fail(error) : { ok: true };
}

export async function deleteFilter(id) {
  const { error } = await (await supabase()).from("loot_filters").delete().eq("id", id);
  return error ? fail(error) : { ok: true };
}

// ---------- Likes on published builds (one per account, not on your own).
/** The ids of the builds (from those given) the player has liked. */
export async function myLikes(userId, buildIds) {
  if (!buildIds.length) return { ok: true, ids: new Set() };
  const { data, error } = await (await supabase()).from("build_likes").select("build_id").eq("user_id", userId).in("build_id", buildIds);
  return error ? fail(error) : { ok: true, ids: new Set(data.map((r) => r.build_id)) };
}

export async function setLike(buildId, liked) {
  const sb = await supabase();
  const { error } = liked
    ? await sb.from("build_likes").insert({ build_id: buildId })
    : await sb.from("build_likes").delete().eq("build_id", buildId);
  return error && error.code !== "23505" ? fail(error) : { ok: true };
}
