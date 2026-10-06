<template>
  <section class="fueling-next" :aria-busy="loading">
    <div v-if="loading" class="py-8 space-y-4" role="status">
      <USkeleton class="h-8 w-2/3" /><USkeleton class="h-5 w-1/2" />
      <span class="sr-only">{{ t('journey_fueling_loading') }}</span>
    </div>
    <div v-else-if="error" class="py-6">
      <h2 class="fueling-next__title">{{ t('journey_fueling_error_title') }}</h2>
      <p class="mt-3 text-sm text-muted" role="alert">{{ error }}</p>
      <UButton class="mt-5" @click="emit('retry')">{{ t('journey_retry') }}</UButton>
      <UButton :to="journalRoute" class="mt-5 ml-3" color="neutral" variant="link">{{
        t('journey_open_journal')
      }}</UButton>
    </div>
    <template v-else-if="feed?.nextWindow">
      <p class="text-sm text-muted">
        {{ formatWindowType(feed.nextWindow.type) }}
        <span class="ml-2">{{
          formatTimeRange(feed.nextWindow.startTime, feed.nextWindow.endTime)
        }}</span>
      </p>
      <h2 class="fueling-next__title mt-3">
        {{ feed.nextWindow.workoutTitle || t('journey_daily_fueling') }}
      </h2>
      <p v-if="feed.nextWindow.lockedMeal" class="mt-4 text-lg">
        {{ feed.nextWindow.lockedMeal.title }}
      </p>
      <p v-else-if="isTimingOnlyWindow || dailyCarbReached" class="mt-4 text-muted leading-relaxed">
        {{ t('journey_target_reached_description') }}
      </p>
      <p v-else class="mt-4 text-muted leading-relaxed">{{ t('journey_next_meal_description') }}</p>
      <p
        v-if="Number.isFinite(feed.nextWindow.requiredCarbs) && !isTimingOnlyWindow"
        class="mt-4 text-sm"
      >
        {{ t('journey_carbs_remaining', { carbs: Math.max(0, feed.nextWindow.requiredCarbs) }) }}
      </p>
      <div class="mt-6">
        <UButton
          v-if="feed.nextWindow.lockedMeal || !canSuggestMeal"
          :to="journalRoute"
          size="lg"
          >{{
            feed.nextWindow.lockedMeal ? t('journey_view_planned_meal') : t('journey_log_food')
          }}</UButton
        >
        <UButton v-else size="lg" @click="emit('open-ai-helper', displayRecommendation)">{{
          t('journey_choose_meal')
        }}</UButton>
      </div>
      <details class="fueling-next__disclosure mt-7">
        <summary>{{ t('journey_target_detail') }}</summary>
        <div class="pb-5 space-y-3 text-sm leading-relaxed">
          <p v-if="Number.isFinite(feed.nextWindow.targetCarbs)">
            {{ t('journey_carb_target', { carbs: feed.nextWindow.targetCarbs }) }}
          </p>
          <p v-if="feed.nextWindow.carryoverCredit > 0">
            {{ t('journey_carryover', { carbs: feed.nextWindow.carryoverCredit }) }}
          </p>
          <p v-if="isTimingOnlyWindow" class="text-muted">{{ t('journey_timing_optional') }}</p>
          <p v-if="feed.dailyCarbStatus">
            {{
              t('journey_daily_carbs', {
                actual: feed.dailyCarbStatus.actual,
                target: feed.dailyCarbStatus.target
              })
            }}
          </p>
          <template v-if="feed.nextWindow.lockedMeal">
            <p>
              {{ t('journey_planned_carbs', { carbs: feed.nextWindow.lockedMeal.totals.carbs }) }}
            </p>
            <p v-if="feed.nextWindow.lockedMeal.absorptionType" class="text-muted">
              {{
                t('journey_absorption_type', { type: feed.nextWindow.lockedMeal.absorptionType })
              }}
            </p>
            <ul class="space-y-1">
              <li
                v-for="ingredient in feed.nextWindow.lockedMeal.ingredients"
                :key="ingredient.item"
              >
                {{ ingredient.quantity }}{{ ingredient.unit }} {{ ingredient.item }}
              </li>
            </ul>
            <UButton
              color="neutral"
              variant="outline"
              @click="emit('open-ai-helper', feed.nextWindow)"
              >{{ t('journey_change_meal') }}</UButton
            >
          </template>
          <template v-else-if="displayRecommendation">
            <p v-if="feed.mealRecommendation" class="font-medium">
              {{ feed.mealRecommendation.item }}
            </p>
            <p v-if="Number.isFinite(displayRecommendation.carbs)">
              {{ t('journey_suggested_carbs', { carbs: displayRecommendation.carbs }) }}
            </p>
            <p v-if="displayRecommendation.absorptionType" class="text-muted">
              {{ t('journey_absorption_type', { type: displayRecommendation.absorptionType }) }}
            </p>
            <p v-if="displayRecommendation.timing" class="text-muted">
              {{ displayRecommendation.timing }}
            </p>
            <p v-if="feed.mealRecommendation?.reasoning" class="text-muted">
              {{ feed.mealRecommendation.reasoning }}
            </p>
            <UButton v-if="canSuggestMeal" color="neutral" variant="link" :to="journalRoute">{{
              t('journey_log_food')
            }}</UButton>
          </template>
        </div>
      </details>
    </template>
    <div v-else class="py-5">
      <h2 class="fueling-next__title">
        {{ t(feed ? 'journey_no_window_title' : 'journey_no_guidance_title') }}
      </h2>
      <p class="mt-4 text-muted leading-relaxed">{{ t('journey_empty_fueling_description') }}</p>
      <UButton :to="journalRoute" size="lg" class="mt-6">{{ t('journey_open_journal') }}</UButton>
    </div>
    <details v-if="feed?.recentItems?.length" class="fueling-next__disclosure mt-5">
      <summary>{{ t('journey_recent_food') }}</summary>
      <div class="divide-y divide-default pb-5">
        <div v-for="item in feed.recentItems" :key="item.id" class="flex items-center gap-3 py-4">
          <UIcon :name="getMealIcon(item.mealType)" class="size-4 text-muted shrink-0" />
          <div class="flex-1">
            <p class="text-sm font-medium">{{ item.name || item.title }}</p>
            <p class="text-xs text-muted mt-1">
              {{ formatRelativeTime(item.loggedAt || item.date || item.timestamp) }}
            </p>
            <p v-if="Number.isFinite(item.absorptionProgress)" class="text-xs text-muted mt-1">
              {{ t('journey_absorption_estimate', { percent: item.absorptionProgress }) }}
            </p>
          </div>
          <span v-if="Number.isFinite(item.carbs)" class="text-sm tabular-nums"
            >{{ item.carbs }}g</span
          >
        </div>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
  import { formatDistanceToNow } from 'date-fns'
  import { useTranslate } from '@tolgee/vue'

  const props = defineProps<{
    feed: any
    loading: boolean
    error?: string | null
  }>()

  const emit = defineEmits(['open-ai-helper', 'retry'])
  const { t } = useTranslate('nutrition')
  const { formatDate, formatDateUTC, getUserLocalDate } = useFormat()
  const journalDate = computed(
    () =>
      props.feed?.nextWindow?.dateKey ||
      (props.feed?.nextWindow?.startTime
        ? formatDate(props.feed.nextWindow.startTime, 'yyyy-MM-dd')
        : formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd'))
  )
  const journalRoute = computed(() => `/nutrition/${journalDate.value}`)
  const canSuggestMeal = computed(
    () => !!displayRecommendation.value && !isTimingOnlyWindow.value && !dailyCarbReached.value
  )

  const displayRecommendation = computed(() => {
    if (props.feed?.mealRecommendation) {
      return {
        carbs: props.feed.mealRecommendation.carbs,
        absorptionType: props.feed.mealRecommendation.absorptionType,
        timing: props.feed.mealRecommendation.timing,
        item: props.feed.mealRecommendation.item,
        basedOnWindowType: props.feed.mealRecommendation.windowType || 'fueling window',
        // The AI recommendation carries no window identity of its own; bind it to the window it
        // is being shown against so a lock lands on the right one.
        windowKey: props.feed.nextWindow?.windowKey
      }
    }
    return props.feed?.suggestedIntake
  })

  const dailyCarbReached = computed(() => props.feed?.dailyCarbStatus?.reached === true)
  const isTimingOnlyWindow = computed(
    () => props.feed?.nextWindow?.timingOnly === true && dailyCarbReached.value
  )

  function formatWindowType(type: string) {
    const known = ['PRE_WORKOUT', 'INTRA_WORKOUT', 'POST_WORKOUT', 'DAILY_BASE', 'TRANSITION']
    return known.includes(type)
      ? t.value(`journey_window_${type.toLowerCase()}`)
      : String(type).replaceAll('_', ' ').toLowerCase()
  }

  function formatTimeRange(start: string, end: string) {
    return `${formatDate(new Date(start), 'HH:mm')} - ${formatDate(new Date(end), 'HH:mm')}`
  }

  function formatRelativeTime(date: string | Date) {
    const d = typeof date === 'string' ? new Date(date) : date
    if (!(d instanceof Date) || isNaN(d.getTime())) return ''
    return formatDistanceToNow(d, { addSuffix: true })
  }

  function getMealIcon(type: string) {
    switch (type) {
      case 'breakfast':
        return 'i-lucide-coffee'
      case 'lunch':
        return 'i-lucide-sun'
      case 'dinner':
        return 'i-lucide-moon'
      default:
        return 'i-lucide-apple'
    }
  }
</script>

<style scoped>
  .fueling-next {
    padding-block: 1.5rem 2rem;
  }
  .fueling-next__title {
    font-size: clamp(1.5rem, 4vw, 2rem);
    font-weight: 500;
    line-height: 1.3;
    letter-spacing: -0.03em;
    max-width: 30ch;
  }
  .fueling-next__disclosure {
    border-top: 1px solid var(--ui-border);
  }
  .fueling-next__disclosure summary {
    padding-block: 1.125rem;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--ui-text-muted);
  }
  summary:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 3px;
  }
</style>
