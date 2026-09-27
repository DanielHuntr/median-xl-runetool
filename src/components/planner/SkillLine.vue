<script setup>
import { computed } from "vue";
import SkillText from './SkillText.vue';
import { TRUST_LABELS } from "../../planner/provenance.js";

// One skill tooltip line with where its numbers come from. `detailed` adds the
// expandable formula, inputs and assumptions (skill panel); the hover sheet omits it.
const props = defineProps({ line: { type: Object, required: true }, detailed: { type: Boolean, default: false } });
const l = computed(() => props.line);
const sources = computed(() => (l.value.parts || []).filter((p) => p.source));
const inputText = (i) =>
  i ? `Base Level ${i.blvl}, Effective Level ${i.lvl}, Character Level ${i.ulvl}` : "";
const entries = (o) => Object.entries(o || {});
</script>
<template>
  <li :class="[l.status, { 'skill-effect-heading': l.heading }, l.colour && 'd2c-' + l.colour]">
    <span class="line-text"
      ><SkillText :line="l" /><small v-if="l.status === 'unknown'"> · value not available</small
      ><small v-else-if="l.status === 'varies'"> · depends on your stats</small
      ><small v-if="l.minLevel"> · from character level {{ l.minLevel }}</small></span
    >
    <details v-if="detailed && sources.length" class="line-how">
      <summary>How this is calculated</summary>
      <div v-for="p in sources" class="how-part">
        <p>
          <b>{{ p.key.replace(/_/g, " ") }}</b> · {{ TRUST_LABELS[p.source.status]?.long
          }}<template v-if="p.source.from"> · {{ p.source.from }}</template>
        </p>
        <p v-if="p.source.inputs" class="muted">Inputs: {{ inputText(p.source.inputs) }}</p>
        <ul v-if="p.source.formula?.length" class="how-formula">
          <li v-for="f in p.source.formula"><code>{{ f }}</code></li>
        </ul>
        <p v-for="[k, v] in entries(p.source.resolved)" class="muted">Uses {{ k }} = {{ v.value }} ({{ v.label }})</p>
        <p v-for="[k, v] in entries(p.source.assumed)" class="how-assumed">
          Assumed {{ k }} = {{ v }} (not tracked by the planner)
        </p>
        <p v-for="n in p.source.notes" class="muted">{{ n }}</p>
        <template v-if="p.source.verifiedBy">
          <p v-for="c in p.source.verifiedBy.checks" :class="c.got && c.expected.every((v, i) => c.got[i] === v) ? 'how-ok' : 'how-bad'">
            In game ({{ c.when }}: Base Level {{ c.blvl }}, level {{ c.lvl }}, character {{ c.ulvl }}):
            {{ c.expected.join(" / ") }} · calculated {{ c.got ? c.got.join(" / ") : "nothing" }}
          </p>
          <p class="muted">Observation: {{ p.source.verifiedBy.source }}</p>
        </template>
      </div>
    </details>
  </li>
</template>
