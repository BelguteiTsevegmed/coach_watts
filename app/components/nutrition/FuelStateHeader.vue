<template>
  <section>
    <div v-if="!hideBanner" class="mb-6">
      <h2 class="text-lg font-medium">{{ stateLabel }}</h2>
      <p class="text-sm text-muted mt-2">{{ stateDescription }}</p>
      <p v-if="isLocked" class="text-sm text-muted mt-2">{{ t('detail_manual_lock') }}</p>
      <p v-if="goalAdjustment" class="text-sm mt-2">
        {{ t('journey_goal_adjustment', { percent: goalAdjustment }) }}
      </p>
    </div>
    <div class="divide-y divide-default">
      <button
        v-for="macro in macros"
        :key="macro.label"
        type="button"
        class="macro-total"
        @click="showMacroExplain(macro)"
      >
        <span class="flex-1 text-left text-sm">{{ macro.label }}</span>
        <span class="tabular-nums font-medium">{{ Math.round(macro.actual) }}{{ macro.unit }}</span>
        <span v-if="macro.target > 0" class="text-sm text-muted tabular-nums"
          >/ {{ Math.round(macro.target) }}{{ macro.unit }}</span
        >
        <span v-else class="text-sm text-muted">{{ t('journey_no_target') }}</span>
        <UIcon name="i-heroicons-chevron-right" class="size-4 text-muted" />
      </button>
    </div>
    <NutritionMacroExplainModal
      v-if="selectedMacro"
      v-model="isExplainOpen"
      :label="selectedMacro.label"
      :actual="selectedMacro.actual"
      :target="selectedMacro.target"
      :unit="selectedMacro.unit"
      :fuel-state="fuelState"
      :settings="settings"
      :weight="weight"
      :fueling-plan="fuelingPlan"
    />
  </section>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  const { t } = useTranslate('nutrition')
  const props = withDefaults(
    defineProps<{
      fuelState: number
      isLocked?: boolean
      goalAdjustment?: number
      settings: any
      weight: number
      targets: {
        calories: number
        carbs: number
        protein: number
        fat: number
      }
      actuals: {
        calories: number
        carbs: number
        protein: number
        fat: number
      }
      fuelingPlan?: any
      hideBanner?: boolean
    }>(),
    {
      isLocked: false,
      goalAdjustment: 0,
      fuelingPlan: undefined,
      hideBanner: false
    }
  )
  const isExplainOpen = ref(false)
  const selectedMacro = ref<any>(null)

  function showMacroExplain(macro: any) {
    selectedMacro.value = macro
    isExplainOpen.value = true
  }

  const stateLabel = computed(() => {
    switch (props.fuelState) {
      case 3:
        return 'Performance'
      case 2:
        return 'Steady'
      default:
        return 'Eco'
    }
  })

  const stateDescription = computed(() => {
    switch (props.fuelState) {
      case 3:
        return 'High intensity day. Prioritize carbohydrates for peak output and recovery.'
      case 2:
        return 'Endurance/Tempo day. Balanced fueling to support consistent energy.'
      default:
        return 'Recovery/Easy day. Focus on fat oxidation and high-quality protein.'
    }
  })

  const macros = computed(() => [
    {
      label: 'Calories',
      actual: props.actuals.calories,
      target: props.targets.calories,
      unit: '',
      icon: 'i-tabler-flame',
      iconColor: 'text-orange-500',
      barColor: 'bg-orange-500',
      percentage: Math.round((props.actuals.calories / props.targets.calories) * 100) || 0,
      statusColor: getStatusColor(props.actuals.calories / props.targets.calories)
    },
    {
      label: 'Carbs',
      actual: props.actuals.carbs,
      target: props.targets.carbs,
      unit: 'g',
      icon: 'i-tabler-bread',
      iconColor: 'text-yellow-500',
      barColor: 'bg-yellow-500',
      percentage: Math.round((props.actuals.carbs / props.targets.carbs) * 100) || 0,
      statusColor: getStatusColor(props.actuals.carbs / props.targets.carbs)
    },
    {
      label: 'Protein',
      actual: props.actuals.protein,
      target: props.targets.protein,
      unit: 'g',
      icon: 'i-tabler-egg',
      iconColor: 'text-blue-500',
      barColor: 'bg-blue-500',
      percentage: Math.round((props.actuals.protein / props.targets.protein) * 100) || 0,
      statusColor: getStatusColor(props.actuals.protein / props.targets.protein)
    },
    {
      label: 'Fat',
      actual: props.actuals.fat,
      target: props.targets.fat,
      unit: 'g',
      icon: 'i-tabler-droplet',
      iconColor: 'text-green-500',
      barColor: 'bg-green-500',
      percentage: Math.round((props.actuals.fat / props.targets.fat) * 100) || 0,
      statusColor: getStatusColor(props.actuals.fat / props.targets.fat)
    }
  ])

  function getStatusColor(ratio: number) {
    if (ratio > 1.1) return 'text-red-500'
    if (ratio > 0.9) return 'text-green-500'
    if (ratio > 0.7) return 'text-orange-500'
    return 'text-gray-400'
  }
</script>

<style scoped>
  .macro-total {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 0.875rem;
    padding-block: 1.125rem;
  }
  .macro-total:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 3px;
  }
</style>
