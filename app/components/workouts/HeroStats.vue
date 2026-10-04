<template>
  <div class="flex flex-col gap-3" data-testid="workout-hero-stats">
    <!-- Headline numbers -->
    <div
      class="grid gap-px overflow-hidden rounded-2xl border border-gray-200 dark:border-white/5 bg-gray-200 dark:bg-white/5"
      :class="primaryGridClass"
    >
      <div
        v-for="stat in primary"
        :key="stat.key"
        class="flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-900 px-2"
        :class="compact ? 'py-3' : 'py-5'"
        :data-testid="`hero-stat-${stat.key}`"
      >
        <UTooltip v-if="stat.tooltip" :text="stat.tooltip">
          <span
            :class="labelClass"
            class="border-b border-dashed border-gray-300 dark:border-gray-700"
          >
            {{ stat.label }}
          </span>
        </UTooltip>
        <span v-else :class="labelClass">{{ stat.label }}</span>
        <div class="flex items-baseline gap-1">
          <span
            class="font-black tracking-tight tabular-nums text-gray-900 dark:text-white"
            :class="[compact ? 'text-2xl' : 'text-3xl lg:text-4xl', stat.valueClass]"
          >
            {{ stat.value }}
          </span>
          <span v-if="stat.unit" class="text-xs font-semibold text-gray-500 dark:text-gray-400">
            {{ stat.unit }}
          </span>
        </div>
      </div>
    </div>

    <!-- Supporting numbers -->
    <div
      v-if="secondary.length"
      class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-2"
    >
      <div
        v-for="stat in secondary"
        :key="stat.key"
        class="flex items-baseline gap-1.5"
        :data-testid="`hero-stat-${stat.key}`"
      >
        <UTooltip v-if="stat.tooltip" :text="stat.tooltip">
          <span
            class="text-xs text-gray-500 dark:text-gray-400 border-b border-dashed border-gray-300 dark:border-gray-700"
            >{{ stat.label }}</span
          >
        </UTooltip>
        <span v-else class="text-xs text-gray-500 dark:text-gray-400">{{ stat.label }}</span>
        <span
          class="text-sm font-bold tabular-nums text-gray-900 dark:text-white"
          :class="stat.valueClass"
          >{{ stat.value }}</span
        >
        <span v-if="stat.unit" class="text-[11px] text-gray-500 dark:text-gray-400">{{
          stat.unit
        }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  export interface WorkoutHeroStat {
    key: string
    label: string
    value: string | number
    unit?: string
    tooltip?: string
    valueClass?: string
  }

  const props = withDefaults(
    defineProps<{
      primary: WorkoutHeroStat[]
      secondary?: WorkoutHeroStat[]
      compact?: boolean
    }>(),
    {
      secondary: () => [],
      compact: false
    }
  )

  const labelClass = computed(() =>
    props.compact
      ? 'text-[11px] font-medium text-gray-500 dark:text-gray-400'
      : 'text-xs font-medium text-gray-500 dark:text-gray-400'
  )

  const primaryGridClass = computed(() => {
    const count = props.primary.length
    if (count >= 4) return 'grid-cols-2 lg:grid-cols-4'
    if (count === 3) return 'grid-cols-3'
    if (count === 2) return 'grid-cols-2'
    return 'grid-cols-1'
  })
</script>
