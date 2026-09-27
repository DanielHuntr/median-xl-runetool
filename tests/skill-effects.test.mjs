import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const planner = JSON.parse(await readFile(new URL('../public/planner/data.json', import.meta.url), 'utf8'));
let vite, engine, catalog, computeCharacter, skillDamage;
test.before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  const load = p => vite.ssrLoadModule(p);
  const { createEngine } = await load('/src/planner/engine.js');
  const { createCatalog } = await load('/src/planner/items.js');
  ({ computeCharacter } = await load('/src/planner/character.js'));
  ({ skillDamage } = await load('/src/planner/damage.js'));
  engine = createEngine(planner); catalog = createCatalog(await load('/src/data/index.js'), planner);
});
test.after(() => vite.close());
const make = (cls, points, buffs = []) => ({ cls, level: 120, points, buffs, quests: {},
  attrs: { strength: 100, dexterity: 100, vitality: 100, energy: 100 }, signets: 0, difficulty: 'Normal', inventory: [], swap: false,
  gear: { weapon: { ref: 'custom', custom: { slotType: 'weapon', name: 'Test weapon', text: 'One-Hand Damage: 100 to 200\nWeapon Physical Damage +400%\nAdds 20-30 Fire Damage' } },
    body: { ref: 'custom', custom: { slotType: 'body', name: 'Test armor', text: 'Defense: 1000' } } } });
const sheet = b => computeCharacter(b, { engine, catalog, planner });
const damage = (b, id, c = sheet(b)) => skillDamage(id, { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c });

test('Dragon Jaws exposes its physical spell damage, mana cost and capped current-mana synergy', () => {
  const b = { ...make('Paladin', { dragon_jaws: 5 }), level: 18, soft: { dragon_jaws: 11 }, charStats: { mana: 108 } };
  const now = engine.describe(b, 'dragon_jaws', 5).effect;
  const next = engine.describe(b, 'dragon_jaws', 6).effect;
  // Screenshot: effective level 16 costs 47; next level costs 50.
  assert.ok(now.some(l => l.text === 'Mana Cost: 47'));
  assert.ok(next.some(l => l.text === 'Mana Cost: 50'));
  assert.ok(now.some(l => l.parts.some(p => p.key === 'physical_damage' && p.values.every(Number.isFinite))));
  const synergy = mana => engine.synergies({ ...b, charStats: { mana } }, 'dragon_jaws', 5);
  assert.ok(synergy(108).lines.some(l => l.text === 'Current Mana: +3% Increased Damage'));
  assert.ok(synergy(36000).lines.some(l => l.text === 'Current Mana: +600% Increased Damage'));
  assert.ok(synergy(108).bonus.every(l => !l.text.includes('-82%')));
  const plain = { ...make('Paladin', { dragon_jaws: 16 }), gear: {}, level: 18 };
  const c = sheet(plain);
  const withMana = mana => skillDamage('dragon_jaws', { engine, build: plain, skillBuild: { ...plain, charStats: { ...c.charStats, mana } }, character: c });
  assert.equal(withMana(108).kind, 'spell');
  assert.ok(withMana(108).total[0] > withMana(0).total[0]);
  assert.deepEqual(withMana(21600).total, withMana(36000).total, 'mana synergy caps at 600%');
  const geared = { ...plain, gear: { amulet: { ref: 'custom', custom: { slotType: 'amulet', text: '+50% to Physical/Magic Spell Damage' } } } };
  assert.ok(damage(geared, 'dragon_jaws').total[0] > damage(plain, 'dragon_jaws').total[0]);
});

test('Pinnacle grants five real soft levels at 25 hard points, with its defense penalty and no feedback', () => {
  const b = make('Assassin', { pinnacle: 25, crucify: 10, way_of_the_spider: 10 }, ['pinnacle']);
  const off = sheet({ ...b, buffs: [] }), on = sheet(b);
  assert.equal(on.allSkills, 5);
  assert.equal(on.soft.crucify, 5); assert.equal(on.soft.way_of_the_spider, 5);
  assert.equal(on.defense.total, Math.floor(off.defense.total / 2));
  assert.ok(on.damage.weaponPoison.total[0] > off.damage.weaponPoison.total[0]);
  assert.ok(damage(b, 'crucify', on).total[0] > damage({ ...b, buffs: [] }, 'crucify', off).total[0]);
  assert.ok(on.skillBonus.all.some(x => x.source === 'Pinnacle (skill)' && x.value === 5));
  assert.equal(sheet(b).allSkills, 5, 'recalculation does not stack the buff');
  b.gear.amulet = { ref: 'custom', custom: { slotType: 'amulet', text: '+10 to All Skills' } };
  assert.equal(sheet(b).allSkills, 15, 'soft levels never raise the hard-point-based Pinnacle bonus');
  assert.equal(sheet({ ...b, buffs: [] }).soft.crucify, 10, 'turning it off removes only its bonus');
});

test('Anathema lowers physical attack damage without lowering added elemental damage or producing negative hits', () => {
  const b = make('Assassin', { anathema: 20, crucify: 10 }, ['anathema']);
  const on = sheet(b), off = sheet({ ...b, buffs: [] });
  assert.equal(on.damage.otherPct, off.damage.otherPct - 300);
  assert.ok(on.damage.physical[0] < off.damage.physical[0]);
  assert.deepEqual(on.damage.elements.fire, off.damage.elements.fire);
  assert.ok(damage(b, 'crucify', on).parts.find(p => p.element === 'physical').range[0]
    < damage({ ...b, buffs: [] }, 'crucify', off).parts.find(p => p.element === 'physical').range[0]);
  b.gear.weapon.custom.text = 'One-Hand Damage: 100 to 200\nAdds 20-30 Fire Damage';
  assert.deepEqual(sheet(b).damage.physical, [0, 0]);
  assert.ok(damage(b, 'crucify').total.every(x => x >= 0));
});

test('shared level-150 Assassin: all three Ways apply automatically to Backstab and Queen of Blades', async () => {
  const b = JSON.parse(await readFile(new URL('./fixtures/assassin-level-150-ways.json', import.meta.url), 'utf8'));
  assert.deepEqual(b.buffs, [], 'Way passives must work without activating any buffs');
  const full = sheet(b);
  for (const [id, element] of [['way_of_the_phoenix', 'fire'], ['way_of_the_gryphon', 'lightning'], ['way_of_the_spider', 'poison']]) {
    assert.ok(engine.skill(id).tags.includes('Passive'), `${id} classification`);
    assert.ok(engine.node(b, id).tags.includes('Passive'), `${id} tree classification`);
    const without = { ...b, points: { ...b.points, [id]: 0 } }, reduced = sheet(without);
    assert.ok(full.s(`${element}_spell_damage`) > reduced.s(`${element}_spell_damage`), `${id} mastery`);
    assert.ok(full.s(`enemy_${element}_resistance`) > reduced.s(`enemy_${element}_resistance`), `${id} pierce`);
    for (const attack of ['backstab', 'queen_of_blades']) {
      const withDamage = damage(b, attack, full), withoutDamage = damage(without, attack, reduced);
      const part = withDamage.parts.find(p => p.element === element);
      const previous = withoutDamage.parts.find(p => p.element === element)?.range || [0, 0];
      assert.ok(part.range[0] > previous[0] && part.range[1] > previous[1], `${id} contributes ${element} to ${attack}`);
      assert.ok(withDamage.total[0] > withoutDamage.total[0]);
    }
  }
  const fire = full.damage.elements.fire;
  assert.deepEqual(damage(b, 'backstab', full).parts.find(p => p.element === 'fire').range, fire.map(n => Math.floor(n * 2)), 'Backstab applies its 200% weapon damage once');
  assert.deepEqual(damage(b, 'queen_of_blades', full).parts.find(p => p.element === 'fire').range, fire, 'Queen of Blades applies its 100% weapon damage once');
  const { buildProfile } = await vite.ssrLoadModule('/src/planner/recommend.js');
  const { combatScore } = await vite.ssrLoadModule('/src/planner/combatScore.js');
  const score = combatScore(b, full, engine, buildProfile(b, engine));
  assert.ok(!score.skillNames.some(name => /^Way of the /.test(name)), 'passives are not scored as separate castable spells');
});

test('Way of the Raven is passive and adds cold damage, mastery and pierce without activation', () => {
  const b = make('Assassin', { way_of_the_raven: 10, crucify: 10 });
  const c = sheet(b), off = sheet({ ...b, points: { crucify: 10 } });
  assert.ok(engine.skill('way_of_the_raven').tags.includes('Passive'));
  assert.ok(c.s('cold_spell_damage') > off.s('cold_spell_damage'));
  assert.ok(c.s('enemy_cold_resistance') > off.s('enemy_cold_resistance'));
  assert.ok(c.damage.elements.cold[0] > 0);
  assert.ok(damage(b, 'crucify', c).parts.some(p => p.element === 'cold' && p.range[0] > 0));
  assert.ok(!damage({ ...b, points: { crucify: 10 } }, 'crucify', off).parts.some(p => p.element === 'cold'));
});

test('Backstab repeats weapon hits and Flamestrike exposes a one-to-thirteen hit range', () => {
  const b = make('Assassin', { backstab: 20, way_of_the_spider: 10 });
  const d = damage(b, 'backstab');
  assert.equal(d.count.min, 7); assert.equal(d.count.n, 8);
  for (const p of d.parts) {
    const all = d.allParts.find(x => x.element === p.element);
    assert.deepEqual(all.range, p.element === 'poison' ? p.range : [p.range[0] * 7, p.range[1] * 8]);
  }
  const f = damage(make('Sorceress', { flamestrike: 10 }), 'flamestrike');
  assert.equal(f.count.min, 1); assert.equal(f.count.n, 13);
  assert.deepEqual(f.all, [f.total[0], f.total[1] * 13]);
});

test('Paladin game-only effects reach other skills: Stormlord attributes and Spark of Hope speeds', () => {
  const b = make('Paladin', { stormlord: 10, spark_of_hope: 5 }, ['spark_of_hope']);
  const c = sheet(b), empty = sheet(make('Paladin', {}));
  for (const attr of ['strength', 'dexterity', 'energy', 'vitality']) assert.ok(c.attributes[attr].total > empty.attributes[attr].total, attr);
  for (const stat of ['attack_speed', 'cast_speed', 'hit_recovery', 'movement_speed']) assert.ok(c.s(stat) > 0, stat);
  assert.equal(sheet({ ...b, buffs: [] }).s('cast_speed'), 0);
});

test('Necromancer Death Pact tree bonuses reach the character and Famine uses final attributes regardless of point order', () => {
  const names = { 'Angel of Death': 25, Apprenticeship: 5, 'Blood Skeleton': 5, Carnage: 1, 'Death Pact': 1, 'Death Ripple': 5, 'Death Ward': 1, Deathlord: 25, 'Demonic Commune': 6, Embalming: 1, 'Ominous Vigor': 5, Parasite: 1, Sacrifices: 1, Widowmaker: 6 };
  const points = Object.fromEntries(Object.entries(names).map(([name, n]) => [Object.keys(planner.skills).find(id => planner.skills[id].name === name && planner.skills[id].class === 'Necromancer'), n]));
  const b = make('Necromancer', points), c = sheet(b);
  const contribution = stat => c.stats[stat]?.sources.filter(x => x.source === 'Death Pact (skill)').reduce((n, x) => n + x.value, 0) || 0;
  assert.equal(contribution('enhanced_weapon_damage'), 47);
  assert.equal(contribution('attack_speed'), 1);
  assert.equal(contribution('poison_spell_damage'), 2);
  assert.equal(contribution('mana'), 34);
  const first = make('Necromancer', { famine: 10, ominous_vigor: 5 });
  const second = { ...first, points: { ominous_vigor: 5, famine: 10 } };
  assert.equal(sheet(first).damage.otherPct, sheet(second).damage.otherPct);
  assert.ok(sheet(first).damage.otherPct > 400);
});

test('Barbarian stances are exclusive and weapon damage feeds Heart of Stone', () => {
  const b = make('Barbarian', { wolf_stance: 10, bear_stance: 10, heart_of_stone: 1 }, ['bear_stance', 'wolf_stance']);
  const wolf = sheet(b), bear = sheet({ ...b, buffs: ['wolf_stance', 'bear_stance'] });
  assert.ok(wolf.damage.otherPct > bear.damage.otherPct);
  assert.ok(wolf.s('chance_of_crushing_blow') > bear.s('chance_of_crushing_blow'));
  assert.ok(bear.defense.total > wolf.defense.total);
  assert.equal(wolf.charStats.stance, 5); assert.equal(bear.charStats.stance, 1);
});

test('Druid morph bonuses and Primal Bond depend on the active form and minion resistance', () => {
  const b = make('Druid', { werebear_morph: 10, hunger: 5, primal_bond: 5, growth: 5 }, ['werebear_morph']);
  const bear = sheet(b), human = sheet({ ...b, buffs: [] });
  assert.ok(bear.attributes.strength.total > human.attributes.strength.total);
  assert.ok(bear.damage.otherPct > human.damage.otherPct);
  assert.ok(bear.s('life_stolen_per_hit') > human.s('life_stolen_per_hit'));
  assert.ok(human.damage.otherPct > 400, 'Growth summon resistance feeds Primal Bond');
});

test('Sorceress Energy feeds Blight, Nova Charge uses base Dexterity and Blight disables elemental attacks', () => {
  const b = make('Sorceress', { blight: 1, nova_charge: 5 }, ['nova_charge']);
  const c = sheet(b), off = sheet({ ...b, buffs: [] });
  assert.ok(c.attributes.energy.total > off.attributes.energy.total);
  assert.ok(c.s('poison_spell_damage') > off.s('poison_spell_damage'));
  assert.equal(c.damage.elements.fire, undefined);
  assert.ok(!damage(b, 'attack', c).parts.some(p => p.element === 'fire'));
  b.gear.amulet = { ref: 'custom', custom: { slotType: 'amulet', text: '+100 to Dexterity' } };
  assert.equal(sheet(b).attributes.energy.total, c.attributes.energy.total, 'Nova Charge reads base Dexterity, not equipment Dexterity');
});

test('Amazon passive weapon bonuses and active defense penalties reach the sheet', () => {
  const b = make('Amazon', { dragonlore: 10, wyrmshot: 10, ecstatic_frenzy: 10 }, ['ecstatic_frenzy']);
  const c = sheet(b), off = sheet({ ...b, buffs: [] });
  assert.ok(c.damage.otherPct > 400);
  assert.equal(c.defense.total, 0); assert.ok(off.defense.total > 0);
  assert.ok(c.damage.elements.magic[0] > 0);
});

test('summon attack rating is never added to the player by activating a summon aura', () => {
  for (const [cls, id] of [['Amazon', 'fire_elementals'], ['Sorceress', 'ice_elementals']]) {
    const b = make(cls, { [id]: 10 }, [id]);
    assert.equal(sheet(b).ar.total, sheet({ ...b, buffs: [] }).ar.total, id);
  }
});

test('innate buffs require no spent points and summon auras feed real skill levels', () => {
  const innate = make('Amazon', {}, ['bloodlust_innate']);
  assert.ok(sheet(innate).damage.otherPct > sheet({ ...innate, buffs: [] }).damage.otherPct);
  assert.ok(sheet(innate).s('fire_spell_damage') > 0);
  assert.equal(Object.keys(innate.points).length, 0);
  const raven = make('Sorceress', { raven_familiar: 16, flamefront: 10 }, ['raven_familiar']);
  assert.equal(sheet(raven).allSkills, 5);
  assert.equal(sheet(raven).soft.flamefront, 5);
  assert.ok(sheet(raven).attributes.energy.total > sheet({ ...raven, buffs: [] }).attributes.energy.total);
});

test('equipment-gated passives stop applying when their required weapon is replaced', () => {
  const b = make('Assassin', { laserblade: 10, crucify: 10 });
  b.gear.weapon = { ref: 'tu:84', variant: 1 };
  const halberd = sheet(b);
  assert.ok(halberd.stats.minimum_magic_damage.sources.some(s => s.source === 'Laserblade (skill)'));
  b.gear.weapon = { ref: 'rw:30', base: 'base:55', baseVariant: 3 };
  const staff = sheet(b);
  assert.ok(!staff.stats.minimum_magic_damage?.sources.some(s => s.source === 'Laserblade (skill)'));
  assert.ok(!staff.stats.defense_bonus_multiplier?.sources.some(s => s.source === 'Laserblade (skill)'));
});

test('socket-dependent passives count equipped gems and runes, and regeneration scales with final life', () => {
  const gem = catalog.socketables().find(s => s.kindLabel === 'Gems');
  const rune = catalog.socketables().find(s => /rune/i.test(s.kindLabel));
  assert.ok(gem && rune);
  const amazon = make('Amazon', { paragon: 10 });
  amazon.gear.body.custom.text += '\nSocketed (2)';
  amazon.gear.body.socketCount = 2;
  amazon.gear.body.sockets = [gem.key, gem.key];
  const gems = sheet(amazon);
  assert.equal(gems.charStats.socketed_gems, 2);
  assert.ok(gems.stats.vitality.sources.some(s => s.source === 'Paragon (skill)' && s.value > 0));
  const barbarian = make('Barbarian', { runemaster: 10, eagle_stance: 10 }, ['eagle_stance']);
  barbarian.gear.body.custom.text += '\nSocketed (2)';
  barbarian.gear.body.socketCount = 2;
  barbarian.gear.body.sockets = [rune.key, rune.key];
  const runes = sheet(barbarian);
  assert.equal(runes.charStats.socketed_runes, 2);
  assert.ok(runes.s('total_defense_multiplier') > 0);
  assert.ok(runes.s('life_regenerated_per_second') > 0);
  barbarian.gear.amulet = { ref: 'custom', custom: { slotType: 'amulet', text: '+1000 to Life' } };
  assert.ok(sheet(barbarian).s('life_regenerated_per_second') > runes.s('life_regenerated_per_second'));
});

for (const cls of planner.classes.map(c => c.name)) test(`${cls}: every tree skill evaluates at first and maximum base level with finite character effects`, () => {
  const ids = [...new Set(Object.values(planner.trees[cls]).flat().map(n => n.id))];
  for (const id of ids) for (const points of [1, Math.max(1, engine.maxLevel(make(cls, {}), id))]) {
    const b = make(cls, { [id]: points }, [id]), c = sheet(b);
    for (const [key, value] of Object.entries(c.stats)) assert.ok(Number.isFinite(value.total), `${id}: ${key}`);
    for (const key of ['life', 'mana', 'defense']) assert.ok(Number.isFinite(c[key].total), `${id}: ${key}`);
    const d = damage(b, id, c);
    if (d?.total) assert.ok(d.total.every(Number.isFinite), `${id}: damage`);
    assert.ok(!c.warnings.some(w => /circular dependencies/.test(w)), `${id}: convergence`);
  }
});
