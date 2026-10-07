// The database rules (supabase/migrations) tried against an in-process Postgres (PGlite) with
// Supabase's auth pieces stubbed: two signed-in players and an anonymous visitor try to read,
// change or fake each other's data. Every migration runs twice (they must be safe to re-run).
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

test("database rules: players reach only their own data and published builds", { timeout: 120000 }, async () => {
  const DIR = new URL("../supabase/migrations/", import.meta.url);
  const db = new PGlite();
  // Supabase's pieces the migrations lean on.
  await db.exec(`
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create schema auth; grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
  insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000000'), ('bbbbbbbb-0000-0000-0000-000000000000');
`);
  for (const f of readdirSync(DIR).sort()) {
    const sql = readFileSync(new URL(f, DIR), "utf8");
    await db.exec(sql);
    await db.exec(sql); // safe to run again
  }
  const A = "aaaaaaaa-0000-0000-0000-000000000000", B = "bbbbbbbb-0000-0000-0000-000000000000";
  const as = async (who, sql, params) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who === "anon" ? "" : who}', false); set role ${who === "anon" ? "anon" : "authenticated"};`);
    try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role"); }
  };
  const check = (name, ok, got) => assert.ok(ok, `${name}: ${JSON.stringify(got)}`);
  const denied = (r) => !!r.error || (r.rows && r.rows.length === 0);
  const err = (r) => !!r.error;
  const code = "abcdefghij";
  const upsertName = `insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set id = excluded.id, display_name = excluded.display_name`;

  // Builds
  const a1 = await as(A, `insert into public.builds (name, cls, code) values ('A private', 'Amazon', $1) returning id`, [code]);
  const a2 = await as(A, `insert into public.builds (name, cls, code, published) values ('A public', 'Amazon', $1, true) returning id`, [code]);
  const b1 = await as(B, `insert into public.builds (name, cls, code) values ('B private', 'Sorceress', $1) returning id, user_id`, [code]);
  const b2 = await as(B, `insert into public.builds (name, cls, code, published) values ('B public', 'Sorceress', $1, true) returning id`, [code]);
  check("players save builds as themselves", b1.rows?.[0]?.user_id === B, b1);
  const [A1, A2, B1, B2] = [a1, a2, b1, b2].map((r) => r.rows[0].id);
  check("can't read another player's private build", denied(await as(A, `select * from public.builds where id = $1`, [B1])));
  check("can read another player's published build", (await as(A, `select * from public.builds where id = $1`, [B2])).rows?.length === 1);
  const anonList = await as("anon", `select name from public.builds order by name`);
  check("anon reads published builds only", anonList.rows?.map((r) => r.name).join() === "A public,B public", anonList);
  check("can't save a build as another player", err(await as(A, `insert into public.builds (user_id, name, cls, code) values ($1, 'x', 'Amazon', $2)`, [B, code])));
  check("can't edit another player's build", denied(await as(A, `update public.builds set name = 'pwned' where id = $1 returning id`, [B2])));
  check("can't delete another player's build", denied(await as(A, `delete from public.builds where id = $1 returning id`, [B2])));
  check("can't hand own build to another player", err(await as(A, `update public.builds set user_id = $1 where id = $2`, [B, A1])));
  check("can't set own likes", err(await as(A, `update public.builds set likes = 9999 where id = $1`, [A2])));
  check("can't backdate a build", err(await as(A, `update public.builds set created_at = now() - interval '9 years' where id = $1`, [A1])));
  check("anon can't save builds", err(await as("anon", `insert into public.builds (name, cls, code) values ('x', 'Amazon', $1)`, [code])));
  check("bad build code rejected", err(await as(A, `insert into public.builds (name, cls, code) values ('x', 'Amazon', '<script>alert(1)</script>')`)));

  // Likes
  check("can like another's published build", !err(await as(A, `insert into public.build_likes (build_id) values ($1)`, [B2])));
  check("like counted", (await as(A, `select likes from public.builds where id = $1`, [B2])).rows?.[0]?.likes === 1);
  check("can't like twice", err(await as(A, `insert into public.build_likes (build_id) values ($1)`, [B2])));
  check("can't like own build", err(await as(A, `insert into public.build_likes (build_id) values ($1)`, [A2])));
  check("can't like a private build", err(await as(A, `insert into public.build_likes (build_id) values ($1)`, [B1])));
  check("can't like as another player", err(await as(A, `insert into public.build_likes (build_id, user_id) values ($1, $2)`, [A2, B])));
  check("can't backdate a like", err(await as(B, `insert into public.build_likes (build_id, created_at) values ($1, now())`, [A2])));
  check("can't see who else liked", denied(await as(B, `select * from public.build_likes where user_id = $1`, [A])));
  check("can't remove another's like", denied(await as(B, `delete from public.build_likes where user_id = $1 returning build_id`, [A])));

  // Profiles
  check("save own display name (upsert)", !err(await as(A, upsertName, [A, "Alice"])));
  check("rename own display name (upsert)", !err(await as(A, upsertName, [A, "Alice Two"])));
  check("can't create another player's profile", err(await as(A, `insert into public.profiles (id, display_name) values ($1, 'Bob')`, [B])));
  check("can't rename another player", denied(await as(B, `update public.profiles set display_name = 'Mallory' where id = $1 returning id`, [A])));
  check("can't take another's name, any case", err(await as(B, upsertName, [B, "alice two"])));
  check("display name rules (no markup)", err(await as(B, upsertName, [B, "<img src=x>"])));
  check("can't backdate a profile", err(await as(A, `update public.profiles set created_at = now() where id = $1`, [A])));

  // Loot filters
  const fa = await as(A, `insert into public.loot_filters (name, filter) values ('mine', '{"rules":[]}') returning id`);
  check("save own filter", !!fa.rows?.[0]?.id, fa);
  check("can't read another's filter", denied(await as(B, `select * from public.loot_filters`)));
  check("anon can't read filters", denied(await as("anon", `select * from public.loot_filters`)));
  check("can't save a filter as another player", err(await as(A, `insert into public.loot_filters (user_id, name, filter) values ($1, 'x', '{}')`, [B])));
  check("can't backdate a filter", err(await as(A, `update public.loot_filters set created_at = now()`)));

  // Functions
  check("anon can't delete accounts", err(await as("anon", `select public.delete_my_account()`)));
  check("trigger function not callable", err(await as(A, `select public.touch_updated_at()`)));

  // Caps
  await as(A, `insert into public.builds (name, cls, code) select 'b' || g, 'Amazon', $1 from generate_series(1, 498) g`, [code]);
  check("500 builds allowed", (await as(A, `select count(*)::int n from public.builds where user_id = auth.uid()`)).rows?.[0]?.n === 500);
  const over = await as(A, `insert into public.builds (name, cls, code) values ('one too many', 'Amazon', $1)`, [code]);
  check("the 501st refused", /up to 500/.test(over.error || ""), over);
  check("cap is per player (B still saves)", !err(await as(B, `insert into public.builds (name, cls, code) values ('B more', 'Sorceress', $1)`, [code])));
  await as(A, `insert into public.loot_filters (name, filter) select 'f' || g, '{}' from generate_series(1, 99) g`);
  check("the 101st filter refused", /up to 100/.test((await as(A, `insert into public.loot_filters (name, filter) values ('x', '{}')`)).error || ""));

  // Deleting an account removes only the caller's data
  check("delete own account", !err(await as(B, `select public.delete_my_account()`)));
  const left = (await db.query(`select (select count(*)::int from public.builds where user_id = $1) b, (select count(*)::int from public.builds where user_id = $2) a, (select count(*)::int from auth.users) u`, [B, A])).rows[0];
  check("B's data gone, A's kept", left.b === 0 && left.a === 500 && left.u === 1, left);
  await db.close();
});
