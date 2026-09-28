<script setup>
import { ref, shallowRef, computed, onMounted } from "vue";
import Icon from "./AppIcon.vue";
import SkillIcon from "./planner/SkillIcon.vue";
import { createEngine } from "../planner/engine.js";
import { confirmationGaps, isOwn, openQuestions } from "../planner/confirmGaps.js";
import { ISSUES_REPO } from "../composables/useRunetool.js";

// The screenshots that would confirm the most, worked out from the planner's own data:
// every tooltip value records which parts of it haven't been seen in game yet.
const result = shallowRef(null);
const questions = shallowRef([]);
const data = shallowRef(null);
const error = ref("");
const showAll = ref(false);

onMounted(async () => {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}planner/data.json?v=${__BUILD_ID__}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data.value = await res.json();
    // After the page has drawn: the analysis reads every skill's tooltip.
    requestAnimationFrame(() => setTimeout(() => {
      const engine = createEngine(data.value);
      result.value = confirmationGaps(engine);
      questions.value = openQuestions(engine, data.value);
    }, 0));
  } catch (e) {
    error.value = String(e.message || e);
  }
});

const shared = computed(() => result.value?.gaps.filter((g) => !isOwn(g.key)) || []);
const own = computed(() => result.value?.gaps.filter((g) => isOwn(g.key)) || []);
const image = (id) => data.value?.skills[id]?.image || "";
const confirmed = computed(() => [...new Set((data.value?.fixtures || []).map((f) => data.value.skills[f.skill]?.name || f.skill))]);
const issueUrl = (s) => {
  const q = new URLSearchParams({
    template: "confirm_values.yml",
    title: `[Confirm] ${s.name} (${s.cls})`,
    skill: s.name,
    class: s.cls,
    version: __APP_VERSION__,
  });
  return `${ISSUES_REPO}/issues/new?${q}`;
};
// A specific question: the form's title asks it; skill and class are filled in when it names one.
const questionUrl = (q) => {
  const params = new URLSearchParams({ template: "confirm_values.yml", title: `[Question] ${q.question}`, version: __APP_VERSION__ });
  if (q.skill) { params.set("skill", q.skill.name); params.set("class", q.skill.tab === "Mastery" ? "Any class" : q.skill.cls); }
  return `${ISSUES_REPO}/issues/new?${params}`;
};
const openOnes = `${ISSUES_REPO}/issues?q=is%3Aissue+label%3Aconfirmation`;
</script>

<template>
  <section class="confirm-page">
    <div class="confirm-intro">
      <p>
        The planner works out skill values from the game's own files. Some parts of those formulas, and how the game
        writes some tooltip lines, haven't been checked against the real game yet. Those values show as
        <em>unconfirmed</em> in the planner. One in-game screenshot of a skill's tooltip can confirm them for many
        skills at once.
      </p>
      <h2>How to help</h2>
      <ol>
        <li>Pick a skill below. The top ones confirm the most.</li>
        <li>In game, hover it in your skill tree and take a screenshot of the whole tooltip, including <b>Next Level</b>.</li>
        <li>Note your character level, your hard points in the skill, and any + skill levels from gear. One hard point and no bonus is easiest to check, but anything works.</li>
        <li>Press <b>Send a screenshot</b> and drop the image into the GitHub form. You'll need a free GitHub account.</li>
      </ol>
      <p class="muted">
        Already confirmed from in-game screenshots: {{ confirmed.join(", ") || "none yet" }}.
        <a :href="openOnes" target="_blank" rel="noopener">See screenshots already sent <Icon name="arrow" /></a>
      </p>
    </div>

    <p v-if="error" class="warning">Couldn't load the skill data ({{ error }}).</p>
    <p v-else-if="!result" class="muted" aria-busy="true">Working out which screenshots would help most…</p>
    <template v-else>
      <p class="muted">
        {{ result.unconfirmedSkills }} of {{ result.skills }} skills have at least one value that isn't confirmed yet.
      </p>
      <section v-if="questions.length" class="confirm-questions" aria-labelledby="open-questions">
        <h2 id="open-questions">Open questions</h2>
        <p class="muted">Where the sources disagree and only the game can say which is right. One screenshot answers each.</p>
        <ul class="confirm-list">
          <li v-for="q in questions" :key="q.id" class="confirm-card">
            <div class="confirm-head">
              <SkillIcon v-if="q.skill" :image="image(q.skill.id)" />
              <div>
                <h3>{{ q.question }}</h3>
                <p v-if="q.skill" class="confirm-skill-of">
                  {{ q.skill.tab === "Mastery" ? "Any class" : q.skill.cls }} · {{ q.skill.tab }} tree ·
                  <a :href="`#planner?skill=${q.skill.id}`">Open in the planner</a>
                </p>
                <p class="muted">{{ q.detail }}</p>
              </div>
              <a class="btn" :href="questionUrl(q)" target="_blank" rel="noopener">Send an answer</a>
            </div>
          </li>
        </ul>
      </section>
      <h2 class="confirm-subhead">Screenshots that confirm the most</h2>
      <ol class="confirm-list">
        <li v-for="(s, i) in result.suggestions" :key="s.id" class="confirm-card">
          <div class="confirm-head">
            <span class="confirm-rank">{{ i + 1 }}</span>
            <SkillIcon :image="image(s.id)" />
            <div>
              <h3>{{ s.name }}</h3>
              <p class="muted">
                {{ s.cls }} · {{ s.tab }} tab<template v-if="s.requiredLevel > 1"> · learnable from level {{ s.requiredLevel }}</template>
              </p>
            </div>
            <a class="btn gold" :href="issueUrl(s)" target="_blank" rel="noopener">Send a screenshot</a>
          </div>
          <p>
            Helps confirm <b>{{ s.helps }} skill{{ s.helps === 1 ? "" : "s" }}</b
            ><template v-if="s.affectsStats">, including values counted in character stats</template>. It would check:
          </p>
          <ul>
            <li v-for="c in s.confirms.slice(0, 5)" :key="c.key">
              {{ c.text }}<small class="muted"> · {{ c.skills }} skill{{ c.skills === 1 ? "" : "s" }}</small>
              <small v-if="c.line" class="confirm-line">in the line “{{ c.line.replace(/:.*$/, "") }}”</small>
            </li>
            <li v-if="s.confirms.length > 5" class="muted">and {{ s.confirms.length - 5 }} more</li>
          </ul>
        </li>
      </ol>

      <details class="confirm-all" :open="showAll" @toggle="(e) => (showAll = e.target.open)">
        <summary>Everything still unconfirmed ({{ result.gaps.length }})</summary>
        <h3>Shared by several skills</h3>
        <p class="muted">A screenshot of any skill that uses one of these confirms it for all of them.</p>
        <table>
          <thead><tr><th>What isn't confirmed</th><th class="num">Skills</th><th class="num">Of those, in character stats</th></tr></thead>
          <tbody>
            <tr v-for="g in shared" :key="g.key"><td>{{ g.text }}</td><td class="num">{{ g.skills }}</td><td class="num">{{ g.statSkills }}</td></tr>
          </tbody>
        </table>
        <h3>Individual skills</h3>
        <p class="muted">Values that need a screenshot of that skill itself. Values are shown at 1 hard point and character level 150.</p>
        <table>
          <thead><tr><th>Skill</th><th>What isn't confirmed</th><th class="num">In character stats</th></tr></thead>
          <tbody>
            <tr v-for="g in own" :key="g.key">
              <td><b>{{ g.skill.name }}</b><br /><small class="muted">{{ g.skill.cls }} · {{ g.skill.tab }}</small></td>
              <td>
                {{ g.key.startsWith("values:") ? "Can't be worked out yet" : "Only from MedianDB, not the game files" }}
                <ul v-if="g.lines.length" class="confirm-lines"><li v-for="l in g.lines" :key="l">{{ l }}</li></ul>
              </td>
              <td class="num">{{ g.statSkills ? "Yes" : "No" }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </template>
  </section>
</template>
