<template>
  <UCard :ui="mobileListCardUi">
    <template #header>
      <PerformanceCardHeader :title="title" as="h4">
        <UButton
          icon="i-heroicons-cog-6-tooth"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('chart_settings_label')"
          @click="
            () => {
              void $emit('settings')
            }
          "
        />
      </PerformanceCardHeader>
    </template>
    <div class="h-[280px]">
      <ClientOnly>
        <TrendChart :data="data" :type="type" :settings="settings" :plugins="[ChartDataLabels]" />
      </ClientOnly>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  import TrendChart from '~/components/TrendChart.vue'
  import ChartDataLabels from 'chartjs-plugin-datalabels'
  import { useTranslate } from '@tolgee/vue'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'
  import PerformanceCardHeader from './PerformanceCardHeader.vue'

  defineProps<{
    title: string
    data: any[]
    type: 'workout' | 'nutrition'
    settings: any
  }>()

  defineEmits(['settings'])

  const { t } = useTranslate('performance')
</script>
