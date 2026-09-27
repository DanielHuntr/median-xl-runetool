<script setup>
import { computed } from "vue";
import { useRunetool } from "../composables/useRunetool.js";
const { dataStatus, loadLiveCatalog } = useRunetool();
const when = computed(() =>
  dataStatus.fetchedAt
    ? new Date(dataStatus.fetchedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "the last import",
);
</script>
<template>
  <span class="data-status" :class="dataStatus.source" role="status">
    <template v-if="dataStatus.source === 'live'"
      >Live from docs.median-xl.com · fetched {{ when }}.</template
    ><template v-else-if="dataStatus.source === 'loading'"
      >Checking docs.median-xl.com for updates…</template
    ><template v-else
      >Bundled snapshot from {{ when
      }}<template v-if="dataStatus.error">
        · live data unavailable ({{ dataStatus.error }})
        <button class="text-btn" @click="loadLiveCatalog()">Retry</button></template
      >.</template
    >
  </span>
</template>
