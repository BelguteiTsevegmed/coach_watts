<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-none sm:shadow-sm p-5 sm:p-6 border-x-0 sm:border-x border-y border-gray-200 dark:border-white/5 flex flex-col gap-4"
    data-testid="workout-training-impact"
  >
    <div>
      <h2 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <UIcon name="i-heroicons-heart" class="w-4 h-4 text-orange-500" />
        {{ t('impact_title') }}
      </h2>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        {{ t('impact_subtitle') }}
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <button
        v-for="tile in tiles"
        :key="tile.key"
        type="button"
        class="text-left p-3 sm:p-4 rounded-xl border transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-primary-500"
        :class="tile.borderClass"
        :data-testid="`impact-${tile.key}`"
        @click="
          () => {
            emit('open-metric', { key: tile.metricKey, value: tile.rawValue ?? 0 })
          }
        "
      >
        <div class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <UIcon :name="tile.icon" class="w-3.5 h-3.5" :class="tile.iconClass" />
          <UTooltip :text="tile.tooltip" :ui="{ content: 'w-[280px] h-auto whitespace-normal' }">
            <span class="font-semibold text-gray-800 dark:text-gray-200">{{ tile.label }}</span>
          </UTooltip>
          <span class="text-[10px] text-gray-400 dark:text-gray-500">{{ tile.acronym }}</span>
        </div>
        <div
          class="mt-1 text-2xl sm:text-3xl font-black tabular-nums text-gray-900 dark:text-white"
        >
          {{ tile.display }}
        </div>
      </button>
    </div>

    <p
      v-if="formStatus"
      class="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2"
      data-testid="impact-form-meaning"
    >
      <UBadge :color="formStatus.color" variant="soft" size="sm" class="shrink-0">
        {{ t(`impact_form_${formStatus.key}`) }}
      </UBadge>
      <span>{{ t(`impact_form_${formStatus.key}_desc`) }}</span>
    </p>

    <UAccordion
      :items="[{ label: t('impact_calc_title'), slot: 'explanation' }]"
      :ui="{
        trigger: 'text-sm font-medium text-gray-700 dark:text-gray-300',
        root: 'border-t border-gray-100 dark:border-white/5'
      }"
    >
      <template #explanation>
        <div class="pb-2 text-xs text-gray-600 dark:text-gray-400 space-y-3">
          <p>
            <strong class="text-gray-900 dark:text-gray-200">{{ t('impact_source_label') }}</strong>
            {{ ' ' }}
            <span v-if="workout?.source === 'intervals'">
              {{ t('impact_source_intervals', { link: 'Intervals.icu' }) }}
            </span>
            <span v-else>{{ t('impact_source_local') }}</span>
          </p>
          <ul class="list-disc pl-5 space-y-1.5 leading-relaxed">
            <li>{{ tt('tss_load') }}</li>
            <li>{{ tt('fitness_ctl') }}</li>
            <li>{{ tt('fatigue_atl') }}</li>
            <li>{{ tt('form_tsb') }}</li>
          </ul>
        </div>
      </template>
    </UAccordion>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { calculateWorkoutForm, getFormStatus } from '~/utils/workout-detail'

  const props = defineProps<{
    workout: {
      tss?: number | null
      trainingLoad?: number | null
      ctl?: number | null
      atl?: number | null
      source?: string | null
    } | null
  }>()

  const emit = defineEmits<{
    'open-metric': [metric: { key: string; value: number }]
  }>()

  const { t } = useTranslate('workout')
  const { t: tt } = useTranslate('workout-tooltips')

  function roundOrNull(value: number | null | undefined) {
    return value === null || value === undefined || !Number.isFinite(value)
      ? null
      : Math.round(value)
  }

  const form = computed(() => calculateWorkoutForm(props.workout))
  const formStatus = computed(() => getFormStatus(form.value))

  const tiles = computed(() => {
    const load = roundOrNull(props.workout?.tss ?? props.workout?.trainingLoad)
    const fitness = roundOrNull(props.workout?.ctl)
    const fatigue = roundOrNull(props.workout?.atl)
    const formValue = form.value

    return [
      {
        key: 'load',
        // Keys stay as the metric modal expects them.
        metricKey: 'TSS (Load)',
        label: t.value('impact_load'),
        acronym: 'TSS',
        tooltip: tt.value('tss_load'),
        icon: 'i-heroicons-bolt',
        iconClass: 'text-primary-500',
        borderClass: 'border-gray-200 dark:border-white/10',
        rawValue: load,
        display: load ?? '–'
      },
      {
        key: 'fitness',
        metricKey: 'Fitness (CTL)',
        label: t.value('impact_fitness'),
        acronym: 'CTL',
        tooltip: tt.value('fitness_ctl'),
        icon: 'i-heroicons-arrow-trending-up',
        iconClass: 'text-emerald-500',
        borderClass: 'border-gray-200 dark:border-white/10',
        rawValue: fitness,
        display: fitness ?? '–'
      },
      {
        key: 'fatigue',
        metricKey: 'Fatigue (ATL)',
        label: t.value('impact_fatigue'),
        acronym: 'ATL',
        tooltip: tt.value('fatigue_atl'),
        icon: 'i-heroicons-fire',
        iconClass: 'text-orange-500',
        borderClass: 'border-gray-200 dark:border-white/10',
        rawValue: fatigue,
        display: fatigue ?? '–'
      },
      {
        key: 'form',
        metricKey: 'Form (TSB)',
        label: t.value('impact_form'),
        acronym: 'TSB',
        tooltip: tt.value('form_tsb'),
        icon: 'i-heroicons-scale',
        iconClass: 'text-blue-500',
        borderClass: 'border-gray-200 dark:border-white/10',
        rawValue: formValue,
        display: formValue === null ? '–' : `${formValue > 0 ? '+' : ''}${formValue}`
      }
    ]
  })
</script>
