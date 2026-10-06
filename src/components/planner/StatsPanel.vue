<script setup>
import { ref, computed, onMounted } from "vue";
import Icon from "../AppIcon.vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { capTone } from "../../planner/character.js";
import { SOURCES, BASE_MAX_RESIST } from "../../planner/rules.js";
import { isConfirmed } from "../../planner/provenance.js";
import { speedProfile } from "../../planner/speed.js";
import SPEED from "../../data/speed.json";

const { state, build, character, setDifficulty, toggleStats, togglePin, skillsInUse } = usePlanner();
const selected = ref(null);
const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString() : (Math.round(n * 100) / 100).toLocaleString());
const pair = (p) => (p ? `${fmt(p[0])}–${fmt(p[1])}` : "—");

// Opening the same stat again collapses its sources.
const select = (id) => (selected.value = selected.value === id ? null : id);

// Row helpers. A row: { id, label, value, sources, est, note, unconfirmed }.
// unconfirmed: the part of the total from skill values that aren't confirmed against
// the game (community or inferred formulas), shown separately from the total.
function stat(label, key, suffix = "%") {
  return (c) => {
    const sources = c.stats[key]?.sources || [];
    const unconfirmed = sources.filter((x) => !isConfirmed(x.trust)).reduce((n, x) => n + x.value, 0);
    return { id: key, label, value: `${fmt(c.s(key))}${suffix}`, sources, zero: !c.s(key), unconfirmed: unconfirmed ? `${fmt(unconfirmed)}${suffix}` : null };
  };
}
// extra.tone(c): "negative" or "capped" colours the value (capTone).
function derived(id, label, value, sources, extra = {}) {
  return (c) => ({ id, label, value: value(c), sources: sources ? sources(c) : [], ...extra, tone: extra.tone?.(c) ?? null });
}
const EL = ["fire", "cold", "lightning", "poison"];
// Frames per attack or cast and the breakpoints (src/planner/speed.js).
const speed = computed(() => speedProfile(SPEED, build.value.cls, character.value.weapon?.def.base ?? null, { ias: character.value.s("attack_speed"), fcr: character.value.s("cast_speed") }));
function framesRow(id, label, kind, word) {
  return derived(id, label, () => {
    const p = speed.value?.[kind];
    return p ? `${p.frames} frames · ${fmt(Math.round(p.perSecond * 100) / 100)}/s` : "—";
  }, () => (speed.value?.[kind]?.table || []).map((b) => ({
    source: `${b.speed}% ${word} speed${b.frames === speed.value[kind].frames ? " (you)" : ""}`,
    value: `${b.frames} frames`,
  })), {
    note: (() => {
      const sp = speed.value, p = sp?.[kind];
      if (!p) return "No animation for this.";
      const w = sp.weapon.base ? `${sp.weapon.base} (${sp.weapon.wclass}${kind === "attack" ? `, speed modifier ${sp.weapon.wsm}` : ""})` : sp.weapon.known ? "bare hands" : "this weapon (not in the game data; bare-hand animation used)";
      const next = p.next ? `Next: ${p.next.speed}% ${word} speed for ${p.next.frames} frames (+${p.next.speed - p.speed}%).` : "No faster breakpoint: the 75% cap is reached.";
      return `${next} With ${w}. The official Median XL speed calculator's formula, with the game's animation data. Not covered: wereforms, throwing, dual wielding, and skill speed that skips the diminishing curve.`;
    })(),
  });
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const sections = computed(() => {
  const c = character.value;
  const rows = (list) => list.map((f) => f(c));
  return [
    {
      title: "General",
      table: ["", "Total", "% bonus", "Base"],
      grid: [
        ...["strength", "dexterity", "vitality", "energy"].map((a) => ({
          id: a,
          label: cap(a),
          cells: [fmt(c.attributes[a].total), `${c.attributes[a].pct}%`, fmt(c.attributes[a].base)],
          sources: [
            { source: "Class base + points spent", value: c.attributes[a].base },
            ...(c.stats[a]?.sources || []),
            ...(c.stats[`percent_${a}`]?.sources || []).map((x) => ({ ...x, value: `${x.value}%` })),
          ],
        })),
        {
          id: "life",
          label: "Life",
          cells: [fmt(c.life.total), `${c.life.pct}%`, fmt(c.life.base)],
          sources: [
            { source: "Class formula (level, allocated vitality)", value: c.life.base },
            ...(c.life.fromAttribute ? [{ source: "Vitality from items and skills (not raised by %)", value: c.life.fromAttribute }] : []),
            ...(c.stats.maximum_life?.sources || []).map((x) => ({ ...x, value: `${x.value}%` })),
            ...(c.stats.life?.sources || []),
          ],
          note: "Life = base × (1 + % bonus) + life from bonus vitality + flat life. Base uses the class's life per level and per allocated vitality point; Maximum Life +% raises only that base (op 11 in the game's ItemStatCost, as in D2).",
        },
        {
          id: "mana",
          label: "Mana",
          cells: [fmt(c.mana.total), `${c.mana.pct}%`, fmt(c.mana.base)],
          sources: [
            { source: "Class formula (level, allocated energy)", value: c.mana.base },
            ...(c.mana.fromAttribute ? [{ source: "Energy from items and skills (not raised by %)", value: c.mana.fromAttribute }] : []),
            ...(c.stats.maximum_mana?.sources || []).map((x) => ({ ...x, value: `${x.value}%` })),
            ...(c.stats.mana?.sources || []),
          ],
        },
      ],
      rows: rows([
        derived("allskills", "All skill levels", (c) => `+${c.allSkills}`, (c) => c.skillBonus.all),
        derived("classskills", "Class skill levels", (c) => `+${c.classSkills}`, (c) => c.skillBonus.cls),
        derived("signets", "Stat signets", (c) => `${c.statPoints.signets} / ${c.statPoints.signetCap}`, null),
        derived(
          "statpoints",
          "Stat points",
          (c) => `${c.statPoints.spent} / ${c.statPoints.available}`,
          (c) => [
            { source: "5 per level", value: c.statPoints.fromLevels },
            { source: "Lam Esen's Tome", value: c.statPoints.fromQuests },
            { source: "Signets of Learning", value: c.statPoints.signets },
          ],
          { note: SOURCES.statPoints },
        ),
      ]),
    },
    {
      title: "Weapon damage",
      est: true,
      rows: rows([
        derived("phys", "Physical damage", (c) => (!c.damage.hasWeapon ? "No weapon" : c.damage.elemental ? "None (elemental weapon)" : pair(c.damage.physical)), (c) => [
          c.damage.base && { source: `${c.weapon.def.name} base damage`, value: pair(c.damage.base) },
          c.damage.localEd && { source: "Enhanced damage on the weapon", value: `${c.damage.localEd}%` },
          { source: "Strength / dexterity damage bonus", value: `${fmt(c.damage.statBonus)}%` },
          c.damage.otherPct && { source: "Weapon physical damage and off-weapon ED", value: `${c.damage.otherPct}%` },
          ...(c.stats.min_damage?.sources || []).map((x) => ({ ...x, source: `${x.source} (min)` })),
          ...(c.stats.max_damage?.sources || []).map((x) => ({ ...x, source: `${x.source} (max)` })),
        ].filter(Boolean), { note: "(Base × (1 + weapon ED) + flat damage) × (1 + stat bonus + weapon physical damage %). Classic D2 formula; Median XL may differ." }),
        ...Object.keys(c.damage.elements).map((el) =>
          el === "poison" && c.damage.weaponPoison
            ? derived("dmg_poison", "Weapon poison", (c) => `${pair(c.damage.weaponPoison.total)} over ${fmt(c.damage.weaponPoison.seconds)}s`, (c) => c.damage.weaponPoison.sources, {
                est: true,
                note: `Per-second damage from every source adds up; item durations are averaged and skill durations added. Not raised by Poison Spell Damage. Inferred from the ${c.damage.weaponPoison.source}.`,
              })
            : derived(`dmg_${el}`, `${cap(el)} damage`, (c) => pair(c.damage.elements[el]), (c) => [
                ...(c.stats[`minimum_${el}_damage`]?.sources || []),
                ...(c.stats[`maximum_${el}_damage`]?.sources || []),
              ]),
        ),
        stat("W. physical damage", "enhanced_weapon_damage"),
        stat("Off-weapon enhanced damage", "enhanced_damage"),
        stat("Innate elemental damage", "innate_elemental_damage"),
        stat("Crushing blow", "chance_of_crushing_blow"),
        stat("Deadly strike", "deadly_strike"),
        stat("Damage to demons", "damage_to_demons"),
        stat("Damage to undead", "damage_to_undead"),
        derived("ar", "Attack rating", (c) => fmt(c.ar.total), (c) => [
          ...(c.stats.attack_rating?.sources || []),
          ...(c.stats.percent_attack_rating?.sources || []).map((x) => ({ ...x, value: `${x.value}%` })),
        ], { est: true, note: "(5 × Dexterity − 35 + class base + flat AR) × (1 + AR %). Classic D2 formula." }),
      ]),
    },
    {
      title: "Spell damage",
      rows: rows([
        ...EL.map((el) => stat(`${cap(el)} spell damage`, `${el}_spell_damage`)),
        stat("Physical/magic spell damage", "physical_magic_spell_damage"),
        derived("sf", "Spell focus", (c) => `${fmt(c.spellFocus.value)} / ${fmt(c.spellFocus.cap)}`, (c) => [
          ...(c.stats.spell_focus?.sources || []),
          ...(c.stats.percent_spell_focus?.sources || []).map((x) => ({ ...x, value: `${x.value}%` })),
        ]),
        derived("sfbonus", "Spell base damage from energy + focus", (c) => `+${c.spellFocus.bonus}%`, null, {
          est: true,
          note: `130 × (Energy + 20) / (500 + Energy) + min(Spell focus / 10, 100). From ${SOURCES.spellFocus}.`,
        }),
        stat("Poison skill duration", "bonus_to_poison_skill_duration"),
      ]),
    },
    {
      title: "Elemental pierce",
      rows: rows([...EL, "magic"].map((el) => stat(`${cap(el)} pierce`, `enemy_${el}_resistance`))),
    },
    {
      title: "Speed",
      rows: rows([
        stat("Attack", "attack_speed"),
        framesRow("fpa", "Attack frames", "attack", "attack"),
        stat("Cast", "cast_speed"),
        framesRow("fpc", "Cast frames", "cast", "cast"),
        stat("Block", "block_speed"),
        stat("Hit recovery", "hit_recovery"),
        stat("Movement", "movement_speed"),
      ]),
    },
    {
      title: "Summon",
      rows: rows([
        stat("Damage", "summoned_minion_damage"),
        stat("Attack rating", "summoned_minion_attack_rating"),
        stat("Life", "summoned_minion_life"),
        stat("Elemental resistances", "summoned_minion_resistances"),
        stat("Physical resist", "summon_physical_resistance"),
      ]),
    },
    {
      title: "Defenses",
      rows: rows([
        derived("def", "Defense", (c) => fmt(c.defense.total), (c) => [
          ...c.defense.parts,
          { source: "Dexterity ÷ 4", value: c.defense.dex },
          ...(c.stats.defense?.sources || []),
          ...(c.stats.defense_bonus_multiplier?.sources || []).map((x) => ({ ...x, value: `${x.value}%` })),
        ], { est: true, note: "(Item defense + flat defense + Dex/4) × (1 + bonus to defense %). The docs say defense works as in classic D2." }),
        stat("Bonus to defense", "defense_bonus_multiplier"),
        stat("Base block chance", "base_block_chance"),
        stat("Max block chance", "max_block_chance"),
        derived("block", "Chance to block", (c) => `${c.block.value}% / ${c.block.cap}%`, null, {
          est: true,
          tone: (c) => capTone(c.block.value, c.block.cap),
          note: `Block % × (Dexterity − 15) / (2 × Level), capped at ${c.block.cap}%. Block %: ${c.block.pct}%. From ${SOURCES.block}.`,
        }),
        stat("Evade", "evade_chance"),
        stat("Dodge", "dodge_chance"),
        derived("avoid", "Avoid", (c) => `${c.avoid.value}% / ${c.avoid.cap}%`, (c) => c.stats.avoid_chance?.sources || [], { note: SOURCES.avoidCap, tone: (c) => capTone(c.avoid.value, c.avoid.cap) }),
        ...[...EL, "magic", "physical"].map((el) =>
          derived(`res_${el}`, `${cap(el)} resist`, (c) => {
            // Current / max, as Block and Avoid; resistance stacked past the cap is noted.
            const r = c.resist[el];
            const over = r.stacked + r.penalty - r.max;
            return `${r.value}% / ${r.max}%${over > 0 ? ` (+${over}% over)` : ""}`;
          }, (c) => [
            ...(c.stats[el === "physical" ? "physical_resistance" : `${el}_resistance`]?.sources || []),
            c.resist[el].penalty && { source: `${c.difficulty} penalty`, value: `${c.resist[el].penalty}%` },
          ].filter(Boolean), { note: el === "physical" ? SOURCES.physCap : `${SOURCES.resistPenalty}. Maximum starts at ${BASE_MAX_RESIST}%.`, tone: (c) => capTone(c.resist[el].value, c.resist[el].max) }),
        ),
        ...["fire", "cold", "lightning", "magic"].map((el) => stat(`${cap(el)} absorb`, `${el}_absorb`)),
        stat("Physical damage reduced", "physical_damage_taken_reduced", ""),
        stat("Elemental damage reduced", "elemental_magic_damage_taken_reduced", ""),
        stat("Curse length reduction", "curse_length_reduction"),
        stat("Poison length reduction", "poison_length_reduction"),
        derived("freeze", "Half freeze duration", (c) => (c.s("half_freeze_duration") ? "Yes" : "No"), (c) => c.stats.half_freeze_duration?.sources || []),
        derived("frozen", "Cannot be frozen", (c) => (c.s("cannot_be_frozen") ? "Yes" : "No"), (c) => c.stats.cannot_be_frozen?.sources || []),
      ]),
    },
    {
      title: "Sustain",
      rows: rows([
        stat("Life regenerated per second", "life_regenerated_per_second", ""),
        stat("Mana regeneration", "regenerate_mana"),
        stat("Life leech", "life_stolen_per_hit"),
        stat("Mana leech", "mana_stolen_per_hit"),
        stat("Life on melee attack", "life_on_melee_attack", ""),
        stat("Mana on melee attack", "mana_on_melee_attack", ""),
        stat("Life on striking", "life_on_striking", ""),
        stat("Life after each kill", "life_after_each_kill", ""),
        stat("Mana after each kill", "mana_after_each_kill", ""),
        stat("Life when struck", "life_when_struck_by_an_enemy", ""),
      ]),
    },
    {
      title: "Miscellaneous",
      rows: rows([
        stat("Magic find", "magic_find"),
        stat("Gold find", "gold_find"),
        stat("Experience gained", "experience_gained"),
        stat("Light radius", "light_radius", ""),
        stat("Slow target", "slows_target_by"),
        stat("Slow attacker", "slows_attacker"),
        stat("Activation frequency", "activation_frequency"),
        stat("Mana cost of skills", "mana_cost_of_skills"),
      ]),
    },
  ];
});

const hideZero = ref(true);
const visibleRows = (sec) => sec.rows.filter((r) => !(hideZero.value && r.zero));
const visibleSections = computed(() => sections.value.filter((sec) => sec.grid || visibleRows(sec).length));
const signed = (x) => (typeof x.value === "number" ? (x.value > 0 ? "+" : "") + fmt(x.value) : x.value);
// A floating panel takes focus when it opens so Esc closes it straight away.
const closeBtn = ref(null);
onMounted(() => !state.statsPinned && closeBtn.value?.focus());
// Esc closes the floating panel (a pinned panel stays put).
function onKey(e) {
  if (e.key === "Escape" && !state.statsPinned) toggleStats(false);
}
</script>
<template>
  <aside
    id="stats-panel"
    class="stats-panel"
    :class="{ pinned: state.statsPinned }"
    aria-labelledby="stats-panel-title"
    @keydown="onKey"
  >
    <header class="stats-panel-head">
      <h2 id="stats-panel-title">Stats</h2>
      <button
        class="icon-btn pin-btn"
        :aria-pressed="state.statsPinned"
        :title="state.statsPinned ? 'Unpin: float over the planner' : 'Pin: dock beside the planner'"
        @click="togglePin"
      >
        <Icon :name="state.statsPinned ? 'unpin' : 'pin'" /><span class="sr-only">{{
          state.statsPinned ? "Unpin stats panel" : "Pin stats panel"
        }}</span>
      </button>
      <button ref="closeBtn" class="icon-btn" aria-label="Close stats" @click="toggleStats(false)"><Icon name="close" /></button>
    </header>
    <div class="stats-panel-tools">
      <label class="field-inline"
        >Difficulty
        <select :value="build.difficulty" @change="setDifficulty($event.target.value)">
          <option>Normal</option>
          <option>Nightmare</option>
          <option>Hell</option>
        </select></label
      >
      <label class="switch"><input type="checkbox" v-model="hideZero" />Hide stats at 0</label>
      <p class="muted"><em class="est">est.</em> = our own calculation of a game formula. Select a stat to see its sources.</p>
    </div>

    <div class="stats-panel-body">
      <section v-if="skillsInUse.length" class="stat-section">
        <h3>Skill damage<em class="est">estimates</em></h3>
        <!-- Same basis as the skill slots: one hit or cast against the chosen monster. -->
        <p v-if="skillsInUse.some((d) => d.vs)" class="muted stat-note">Per hit or cast, vs {{ skillsInUse.find((d) => d.vs).vs.target.name }}. Select a skill for the damage before resistance.</p>
        <dl class="stat-rows">
          <template v-for="d in skillsInUse" :key="d.id">
            <div class="stat-row" :class="{ selected: selected === 'skill:' + d.id }">
              <dt>
                <button :aria-expanded="selected === 'skill:' + d.id" @click="select('skill:' + d.id)">
                  {{ d.name
                  }}<small v-if="build.leftSkill === d.id" class="slot-tag">L</small
                  ><small v-if="build.rightSkill === d.id" class="slot-tag">R</small>
                </button>
              </dt>
              <dd>{{ d.total ? `${fmt((d.vs || d).total[0])}–${fmt((d.vs || d).total[1])}` : d.kind === "spell" ? "spell" : "—" }}</dd>
            </div>
            <div v-if="selected === 'skill:' + d.id" class="stat-sources">
              <p v-if="d.formula" class="muted">{{ d.formula }}</p>
              <ul v-if="d.parts.length" class="source-list">
                <li v-if="d.vs"><span>Before resistance</span><b>{{ fmt(d.total[0]) }}–{{ fmt(d.total[1]) }}</b></li>
                <li v-for="p in d.parts"><span :class="'el-' + p.element">{{ p.element }}</span><b>{{ fmt(p.range[0]) }}–{{ fmt(p.range[1]) }}</b></li>
                <li v-if="(d.vs || d).all && d.count"><span>{{ d.count.text }} <em class="est">est.</em></span><b>{{ fmt((d.vs || d).all[0]) }}–{{ fmt((d.vs || d).all[1]) }}</b></li>
                <li v-if="d.ar"><span>Attack rating</span><b>{{ fmt(d.ar) }}</b></li>
                <li v-if="d.vs?.hit != null"><span>Chance to hit <em class="est">est.</em></span><b>{{ d.vs.hit }}%</b></li>
              </ul>
              <p v-for="l in d.lines" class="skill-dmg-line">{{ l }}</p>
              <p v-for="n in d.notes" class="muted">{{ n }}</p>
            </div>
          </template>
        </dl>
      </section>
      <section v-for="sec in visibleSections" :key="sec.title" class="stat-section">
        <h3>{{ sec.title }}<em v-if="sec.est" class="est">estimates</em></h3>
        <table v-if="sec.grid" class="stat-grid">
          <thead>
            <tr><th v-for="h in sec.table" scope="col">{{ h }}</th></tr>
          </thead>
          <tbody>
            <template v-for="g in sec.grid" :key="g.id">
              <tr>
                <th scope="row">
                  <button :aria-expanded="selected === g.id" @click="select(g.id)">{{ g.label }}</button>
                </th>
                <td v-for="cell in g.cells">{{ cell }}</td>
              </tr>
              <tr v-if="selected === g.id" class="stat-sources-row">
                <td :colspan="sec.table.length">
                  <p v-if="g.note" class="muted">{{ g.note }}</p>
                  <ul class="source-list">
                    <li v-for="x in g.sources"><span>{{ x.source }}</span><b>{{ signed(x) }}</b></li>
                  </ul>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <dl class="stat-rows">
          <template v-for="r in visibleRows(sec)" :key="r.id">
            <div class="stat-row" :class="{ selected: selected === r.id }">
              <dt>
                <button :aria-expanded="selected === r.id" @click="select(r.id)">
                  {{ r.label }}<em v-if="r.est" class="est">est.</em>
                </button>
              </dt>
              <dd :class="r.tone">{{ r.value }}<small v-if="r.unconfirmed" class="unconfirmed" title="Part of this total comes from skill formulas not confirmed against the game"> incl. {{ r.unconfirmed }} unconfirmed</small></dd>
            </div>
            <div v-if="selected === r.id" class="stat-sources">
              <p v-if="r.note" class="muted">{{ r.note }}</p>
              <ul v-if="r.sources.length" class="source-list">
                <li v-for="x in r.sources"><span>{{ x.source }}</span><b>{{ signed(x) }}</b></li>
              </ul>
              <p v-else class="muted">Nothing contributes to this yet.</p>
            </div>
          </template>
        </dl>
      </section>

      <section v-if="character.sets.length" class="stat-section">
        <h3>Set bonuses</h3>
        <ul class="source-list">
          <li v-for="s in character.sets">
            <span>{{ s.set.name }}</span><b>{{ s.count }}/{{ s.set.items.length }} · {{ s.active.length }} active</b>
          </li>
        </ul>
      </section>
      <section v-if="character.oskills.length" class="stat-section">
        <h3>Oskills from gear</h3>
        <ul class="source-list">
          <li v-for="o in character.oskills"><span>{{ o.name }} <small>{{ o.source }}</small></span><b>+{{ o.value }}</b></li>
        </ul>
      </section>
      <section v-if="character.procs.length || character.features.length || character.skillmods.length" class="stat-section">
        <h3>Effects (not stats)</h3>
        <ul class="effect-list">
          <li v-for="p in [...character.procs, ...character.features, ...character.skillmods]">
            {{ p.text }} <small>· {{ p.source }}</small>
          </li>
        </ul>
      </section>
      <section v-if="character.unknown.length" class="stat-section">
        <h3>Not counted</h3>
        <p class="muted">The planner can't read these lines yet, so they aren't in any total.</p>
        <ul class="effect-list unknown">
          <li v-for="u in character.unknown">{{ u.text }} <small>· {{ u.source }}</small></li>
        </ul>
      </section>
    </div>
  </aside>
</template>
