<template>
  <UCard :ui="mobileListCardUi">
    <template #header>
      <PerformanceCardHeader :title="t('pmc_card_title')" :description="t('pmc_card_explainer')">
        <PerformanceChartControls
          v-model:period="period"
          :period-options="periodOptions"
          @settings="$emit('settings')"
        />
      </PerformanceCardHeader>
    </template>

    <PMCChart :days="period" :settings="settings" />

    <div
      class="mt-4 flex flex-col gap-2 border-t border-default pt-4 text-sm text-muted sm:flex-row sm:items-start sm:justify-between"
    >
      <p>{{ t('pmc_card_healthy_pattern') }}</p>
      <UButton
        to="/fitness"
        color="neutral"
        variant="link"
        size="sm"
        trailing-icon="i-heroicons-arrow-right"
        class="shrink-0 px-0"
      >
        {{ t('link_recovery_details') }}
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import PMCChart from '~/components/PMCChart.vue'
  import PerformanceCardHeader from './PerformanceCardHeader.vue'
  import PerformanceChartControls from './PerformanceChartControls.vue'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'

  defineProps<{
    settings: any
    periodOptions: any[]
  }>()

  const period = defineModel<number | string>('period')

  defineEmits(['settings'])

  const { t } = useTranslate('performance')
</script>
