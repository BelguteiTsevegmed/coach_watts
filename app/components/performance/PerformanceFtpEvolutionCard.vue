<template>
  <UCard :ui="mobileListCardUi">
    <template #header>
      <PerformanceCardHeader :title="t('ftp_card_title')" :description="t('ftp_card_description')">
        <PerformanceChartControls
          v-model:scope="scope"
          v-model:period="period"
          :scope-options="scopeOptions"
          :period-options="periodOptions"
          @settings="$emit('settings')"
        />
      </PerformanceCardHeader>
    </template>

    <FTPEvolutionChart :months="period" :sport="sport" :tags="tags" :settings="settings" />
  </UCard>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'
  import PerformanceCardHeader from './PerformanceCardHeader.vue'
  import PerformanceChartControls from './PerformanceChartControls.vue'
  import FTPEvolutionChart from '~/components/FTPEvolutionChart.vue'

  defineProps<{
    settings: any
    scopeOptions: any[]
    periodOptions: any[]
    sport?: string
    tags?: string[]
  }>()

  const scope = defineModel<string>('scope')
  const period = defineModel<number | string>('period')

  defineEmits(['settings'])

  const { t } = useTranslate('performance')
</script>
