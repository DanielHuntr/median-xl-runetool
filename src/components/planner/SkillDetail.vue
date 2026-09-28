<script setup>
import { computed } from "vue";
import SkillIcon from "./SkillIcon.vue";
import SkillLine from "./SkillLine.vue";
import SkillText from './SkillText.vue';
import { isToggleSkill, activeSkillIds } from '../../planner/skillEffects.js';
import { usePlanner } from "../../planner/usePlanner.js";
const { engine, state, build, skillBuild, character, add, addMax, remove, toggleBuff, setSkillSlot, addToBar } = usePlanner();

const s = computed(() => (state.selected ? engine.node(build.value, state.selected) : null));
const d = computed(() => {
  const n = s.value;
  if (!n) return null;
  const b = build.value;
  const points = b.points[n.id] || 0;
  const max = engine.maxLevel(b, n.id);
  const levelReq = engine.requiredCharLevel(n.id, b);
  const reqs = [];
  if (levelReq) reqs.push({ text: `Character level ${levelReq}`, met: b.level >= levelReq });
  for (const p of n.prereqs) {
    const [type, value, target = ""] = p.split(":");
    const v = parseInt(value, 10);
    if (type === "skill_level")
      reqs.push({
        text: `${v === 1 ? "" : v + " points in "}${engine.skillName(target)}`,
        met: (b.points[target] || 0) >= v,
      });
    else if (type === "skill_level_any") {
      const ids = target.split("|");
      reqs.push({
        text: `${v === 1 ? "" : v + " points in "}${ids.map(engine.skillName).join(" or ")}`,
        met: ids.some((t) => (b.points[t] || 0) >= v),
      });
    } else if (type === "tree_points")
      reqs.push({ text: `${v} points in the ${target} tree`, met: engine.tabPoints(b, target) >= v });
    else if (type === "skill_blocked_by")
      reqs.push({ text: `No points in ${engine.skillName(target)}`, met: (b.points[target] || 0) <= v });
  }
  const bonus = character.value.soft[n.id] || 0;
  const sb = skillBuild.value;
  const effects = engine.skillStatEffects(sb, n.id);
  const levels = engine.levels(sb, n.id);
  return {
    points,
    bonus,
    levels,
    passive: n.tags.includes("Passive"),
    counted: activeSkillIds(sb, engine).includes(n.id),
    toggleable: isToggleSkill(n),
    effects,
    mods: character.value.skillmods.filter((m) => m.id === n.id),
    max,
    maxAt150: engine.maxLevel(b, n.id, 150),
    innate: engine.isInnate(n.id),
    reqs,
    blockers: points ? [] : engine.restrictionProblems(b, n.id),
    notes: engine.maxLevelNotes(b, n.id),
    now: engine.describe(sb, n.id, points),
    synergies: engine.synergies(sb, n.id, points),
    next: points && points < max ? engine.describe(sb, n.id, points + 1) : null,
  };
});
const hasUnknown = computed(() =>
  [d.value?.now, d.value?.next]
    .filter(Boolean)
    .some((x) => [...x.effect, ...x.description, ...x.restriction].some((l) => l.status === "unknown")),
);
</script>
<template>
  <aside class="skill-detail" aria-live="polite">
    <template v-if="s && d">
      <div class="skill-detail-head">
        <SkillIcon :image="s.image" />
        <div>
          <div class="item-kind">{{ [s.tabName, ...s.tags.filter((t) => t !== s.tabName)].join(" · ") }}</div>
          <h2>{{ s.name }}</h2>
        </div>
      </div>
      <div v-if="!d.innate" class="skill-controls">
        <button class="btn" :disabled="!d.points" @click="remove(s.id)" aria-label="Remove a point">−</button>
        <span
          ><b>{{ d.points }}</b><em v-if="d.bonus" title="Bonus levels from equipment and active skills"> +{{ d.bonus }}</em> /
          {{ d.max }}<small v-if="d.maxAt150 !== d.max"> (up to {{ d.maxAt150 }})</small></span
        >
        <button class="btn" @click="add(s.id)" aria-label="Add a point">+</button>
        <button class="btn" @click="addMax(s.id)">Max</button>
      </div>
      <p v-else class="skill-innate">Innate skill: always available, takes no points.</p>
      <div v-if="!d.innate && !d.passive && d.points > 0" class="skill-use">
        <span class="muted">Use:</span>
        <button class="text-btn" :aria-pressed="build.leftSkill === s.id" @click="setSkillSlot('left', s.id)">Left skill</button>
        <button class="text-btn" :aria-pressed="build.rightSkill === s.id" @click="setSkillSlot('right', s.id)">Right skill</button>
        <button class="text-btn" :disabled="build.skillBar.includes(s.id)" @click="addToBar(s.id)">
          {{ build.skillBar.includes(s.id) ? "On skill bar" : "Add to skill bar" }}
        </button>
      </div>

      <ul v-if="d.reqs.length || d.blockers.length" class="skill-reqs">
        <li v-for="r in d.reqs" :class="{ met: r.met }">
          <span aria-hidden="true">{{ r.met ? "✓" : "✗" }}</span>{{ r.text
          }}<span class="sr-only">{{ r.met ? " (met)" : " (not met)" }}</span>
        </li>
        <li v-for="r in d.blockers"><span aria-hidden="true">✗</span>{{ r }}</li>
      </ul>

      <dl v-if="!d.innate" class="skill-levels">
        <div><dt>Base Level</dt><dd>{{ d.levels.base }} <small>hard points</small></dd></div>
        <div><dt>Bonus</dt><dd>+{{ d.levels.bonus }} <small>from equipment and skills</small></dd></div>
        <div><dt>Effective Level</dt><dd>{{ d.levels.effective }}</dd></div>
        <div><dt>Character Level</dt><dd>{{ d.levels.character }}</dd></div>
        <div>
          <dt>Hard-point cap</dt>
          <dd>
            {{ d.levels.cap }} <small>{{ d.levels.capSource.from }}{{ d.levels.capSource.dynamic ? " + rules" : "" }}</small>
            <small v-if="d.levels.capSource.conflict" class="how-assumed">
              · MedianDB says {{ d.levels.capSource.conflict.medianDb }}, game files {{ d.levels.capSource.conflict.game }}; using the game's
            </small>
            <small v-if="d.levels.capSource.confirmed" class="how-assumed">
              · checked in game: {{ Object.entries(d.levels.capSource.confirmed.at).map(([l, c]) => `${c} at level ${l}`).join(", ") }}
            </small>
          </dd>
        </div>
        <div>
          <dt>Required level</dt>
          <dd>
            {{ d.levels.required.value }}
            <small v-if="d.levels.required.unlock" class="how-assumed">
              · Unlocked in game: {{ d.levels.required.unlock }}<template v-if="d.levels.required.medianDb">
              (MedianDB's level {{ d.levels.required.medianDb }} isn't in the game files)</template>
            </small>
            <small v-else-if="d.levels.required.conflict" class="how-assumed">
              · MedianDB {{ d.levels.required.medianDb }}, game files {{ d.levels.required.game }}; using the higher
            </small>
          </dd>
        </div>
      </dl>

      <p v-for="l in d.now.description" class="skill-desc"><SkillText :line="l" /></p>
      <p v-for="l in d.now.restriction" class="skill-restrict"><SkillText :line="l" /></p>
      <p v-for="n in d.notes" class="skill-note">{{ n }}</p>

      <label v-if="!d.passive && (d.points || d.innate) && d.toggleable" class="switch skill-buff"
        ><input type="checkbox" role="switch" :checked="d.counted" @change="toggleBuff(s.id)" />Skill active: include bonuses and penalties</label
      >
      <p v-if="d.counted && d.effects.length" class="skill-note">
        Adds to your stats:
        {{ d.effects.map(([, v, name]) => `${name} ${v > 0 ? "+" : ""}${v}`).join(", ") }}
      </p>
      <ul v-if="d.mods.length" class="skill-mods">
        <li v-for="m in d.mods">{{ m.text }} <small>· {{ m.source }}</small></li>
      </ul>

      <h3>
        {{ d.points ? `Level ${d.points + d.bonus}` : "First Level" }}
      </h3>
      <ul class="stats skill-lines">
        <SkillLine v-for="l in d.now.effect" :line="l" detailed />
      </ul>
      <template v-if="d.next">
        <h3>
          With one more point <small class="muted">(Base Level {{ d.points + 1 }}, level {{ d.points + d.bonus + 1 }})</small>
        </h3>
        <ul class="stats skill-lines">
          <SkillLine v-for="l in d.next.effect" :line="l" detailed />
        </ul>
        <p class="skill-foot">
          The game's own "Next Level" preview adds one Effective Level but keeps the Base Level, so values that
          depend on hard points (such as pierce) can differ from this row.
        </p>
      </template>
      <template v-if="d.synergies">
        <!-- The game's sections below the levels (Mind Flay: "Shock", then "Synergies"), in its colours. -->
        <template v-for="sec in d.synergies.sections" :key="sec.title">
          <h3 :class="'d2c-' + sec.colour">{{ sec.title }}</h3>
          <ul class="stats skill-lines synergy-lines">
            <SkillLine v-for="l in sec.lines" :line="l" detailed />
            <SkillLine v-for="l in sec.bonus || []" :line="l" detailed class="synergy-now" />
          </ul>
        </template>
        <p class="skill-foot">
          Synergy text is the game's own. "From synergies now" is what the game's synergy formula adds at your
          current levels, which can differ from the per-level rate in the text.
        </p>
      </template>
      <p v-if="hasUnknown" class="skill-foot">
        Some values can't be worked out yet (see "How this is calculated" for why), so they're shown without numbers.
      </p>
      <p v-if="d.now.notInGame?.length" class="skill-foot">
        MedianDB also lists {{ d.now.notInGame.join(", ") }}, which isn't on the game's own tooltip and has no value
        in either source, so it's left out.
      </p>
    </template>
    <div v-else class="skill-empty">
      <h2>Select a skill</h2>
      <p>
        Click a skill to add a point. Right-click, or press Delete, to remove one. Hold Shift to
        change 10 at a time.
      </p>
    </div>
  </aside>
</template>
