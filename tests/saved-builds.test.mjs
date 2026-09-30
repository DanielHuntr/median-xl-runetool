import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { encodeBuild, decodeBuild } from '../src/planner/buildCode.js';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

test('browser backups include snapshots and older backups preserve existing snapshots', async () => {
  const source = await readFile(new URL('../scripts/import-browser-state.js', import.meta.url), 'utf8');
  const memory = new Map([['mxlrw2:saved-builds', '[{"name":"Existing"}]']]);
  let input;
  const context = {
    document: { createElement() { input = { click() {} }; return input; } },
    localStorage: { setItem: (k, v) => memory.set(k, v) },
    location: { reload() {} }, alert(message) { throw Error(message); },
  };
  const payload = { format: 'median-xl-runetool', version: 1, data: { state: null, owned: null, stars: null, theme: null } };
  runInNewContext(source, context);
  input.files = [{ text: async () => JSON.stringify(payload) }];
  await input.onchange();
  assert.equal(memory.get('mxlrw2:saved-builds'), '[{"name":"Existing"}]');
  payload.data['saved-builds'] = [{ name: 'Imported' }];
  await input.onchange();
  assert.deepEqual(JSON.parse(memory.get('mxlrw2:saved-builds')), [{ name: 'Imported' }]);
  let exported;
  runInNewContext(await readFile(new URL('../scripts/export-browser-state.js', import.meta.url), 'utf8'), {
    localStorage: { getItem: k => memory.get(k) ?? null },
    Blob, URL: { createObjectURL(blob) { exported = blob; return 'blob:test'; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() {} }) }, setTimeout() {},
  });
  assert.deepEqual(JSON.parse(await exported.text()).data['saved-builds'], [{ name: 'Imported' }]);
});

test('named snapshots preserve builds, handle storage failures and render in the library', async () => {
  const memory = new Map();
  let blocked = false, storageListener;
  globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem(k, v) { if (blocked) throw Error('full'); memory.set(k, v); } };
  globalThis.window = { addEventListener(type, fn) { if (type === 'storage') storageListener = fn; }, removeEventListener() {} };
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { useSavedBuilds } = await vite.ssrLoadModule('/src/planner/savedBuilds.js');
    const store = useSavedBuilds();
    const build = { cls: 'Assassin', level: 120, points: { backstab: 20 }, attrs: { strength: 200 }, gear: { weapon: { ref: 'tu:84', variant: 3, orbs: ['mo-27'], sockets: ['sock:90'] } } };
    const code = encodeBuild(build);
    assert.deepEqual(decodeBuild(code), { v: 2, ...build });
    const first = store.save({ name: 'Backstab', code, cls: build.cls, level: 120, skills: ['Backstab'] });
    assert.equal(first.ok, true);
    assert.equal(store.save({ name: 'Invalid', code: 'abcdefghijk', cls: build.cls }).ok, false);
    assert.equal(store.rename('missing', 'Missing').ok, false);
    const replaced = store.save({ name: 'BACKSTAB', code, cls: build.cls, level: 120 });
    assert.equal(replaced.replaced, true);
    assert.equal(replaced.entry.id, first.entry.id);
    assert.equal(store.builds.value.length, 1);
    assert.equal(store.rename(first.entry.id, 'My Assassin').ok, true);
    store.save({ name: 'Other', code, cls: build.cls });
    assert.equal(store.rename(first.entry.id, 'Other').ok, false);
    blocked = true;
    assert.equal(store.remove(first.entry.id), false);
    assert.equal(store.save({ name: 'Blocked', code, cls: build.cls }).ok, false);
    assert.equal(store.builds.value.length, 2);
    blocked = false;
    const { default: Library } = await vite.ssrLoadModule('/src/components/BuildsBrowser.vue');
    const html = await renderToString(createSSRApp(Library));
    assert.match(html, /My Assassin/);
    assert.match(html, /#planner\?b=/);
    assert.doesNotMatch(html, /starter-card/, 'no starter builds');
    assert.match(html, /share-note/);
    assert.equal(store.remove(first.entry.id), true);
    memory.set('mxlrw2:saved-builds', JSON.stringify([first.entry, first.entry, { bad: true }]));
    storageListener({ key: 'mxlrw2:saved-builds' });
    assert.equal(store.builds.value.length, 1);
    assert.equal(store.builds.value[0].code, code);
    memory.clear();
    storageListener({ key: null });
    assert.equal(store.builds.value.length, 0);
  } finally { await vite.close(); }
});
