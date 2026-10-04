<template>
  <div
    role="button"
    tabindex="0"
    data-testid="calendar-agenda-item"
    :data-status="status"
    class="flex items-start gap-2.5 rounded-lg border-l-4 py-2 pl-2.5 pr-1 shadow-sm transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-500"
    :class="[style.card, dragging ? 'opacity-50' : '']"
    @click="emit('open')"
    @keydown.enter.self.prevent="emit('open')"
    @keydown.space.self.prevent="emit('open')"
  >
    <UIcon :name="icon" class="mt-0.5 h-5 w-5 shrink-0" :class="style.icon" />

    <div class="min-w-0 flex-1 py-0.5">
      <div class="flex items-start gap-1.5">
        <p
          class="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-gray-900 line-clamp-2 dark:text-gray-100"
        >
          {{ activity.title }}
        </p>
        <UIcon
          v-if="status === 'completed'"
          name="i-heroicons-check-circle-solid"
          class="mt-0.5 h-4 w-4 shrink-0 text-green-500"
          :aria-label="t('status_done')"
        />
        <UIcon
          v-if="inComparison"
          name="i-lucide-git-compare-arrows"
          class="mt-0.5 h-4 w-4 shrink-0 text-primary-500"
          :aria-label="t('controls_remove_comparison')"
        />
      </div>

      <p
        v-if="metaItems.length > 0"
        class="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-gray-500 dark:text-gray-400"
      >
        <template v-for="(item, i) in metaItems" :key="i">
          <span v-if="i > 0" class="opacity-50" aria-hidden="true">·</span>
          <span :class="item.class">{{ item.label }}</span>
        </template>
      </p>

      <p
        v-if="linkedPlanTitle"
        class="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400"
      >
        <UIcon name="i-heroicons-link" class="h-3 w-3 shrink-0" />
        <span class="truncate">{{ linkedPlanTitle }}</span>
      </p>
    </div>

    <slot name="aside" />

    <!-- Actions sit on the title row so the card stays one compact block -->
    <div class="-my-1 flex shrink-0 items-center" @click.stop @keydown.stop>
      <UButton
        v-if="draggable"
        icon="i-heroicons-bars-3"
        color="neutral"
        variant="ghost"
        size="sm"
        class="size-10 justify-center touch-none"
        :aria-label="t('controls_drag_reschedule')"
        @click.stop.prevent
        @touchstart.stop.prevent="(event: TouchEvent) => emit('drag-start', event)"
        @touchmove.stop.prevent="(event: TouchEvent) => emit('drag-move', event)"
        @touchend.stop.prevent="emit('drag-end')"
        @touchcancel.stop.prevent="emit('drag-cancel')"
      />
      <UDropdownMenu v-if="menuItems.length > 0" :items="menuItems" :content="{ align: 'end' }">
        <UButton
          icon="i-heroicons-ellipsis-horizontal"
          color="neutral"
          variant="ghost"
          size="sm"
          class="size-10 justify-center"
          :loading="saving"
          :aria-label="t('session_more_actions')"
        />
      </UDropdownMenu>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import type { DropdownMenuItem } from '@nuxt/ui'
  import type { CalendarActivity } from '~/types/calendar'
  import {
    formatSessionDistance,
    formatSessionDuration,
    getEntryIcon,
    getSessionDistanceMeters,
    getSessionDurationSeconds,
    getSessionStatus,
    getSessionStatusStyle,
    type ActivityCalendarSettings
  } from '~/utils/calendarDisplay'

  const props = withDefaults(
    defineProps<{
      activity: CalendarActivity
      settings: ActivityCalendarSettings
      distanceUnits?: string | null
      inComparison?: boolean
      draggable?: boolean
      dragging?: boolean
      saving?: boolean
    }>(),
    {
      distanceUnits: 'Kilometers',
      inComparison: false,
      draggable: false,
      dragging: false,
      saving: false
    }
  )

  const emit = defineEmits<{
    open: []
    'toggle-comparison': []
    'save-to-library': []
    'drag-start': [event: TouchEvent]
    'drag-move': [event: TouchEvent]
    'drag-end': []
    'drag-cancel': []
  }>()

  const { t } = useTranslate('activities')
  const { formatTime } = useFormat()

  const status = computed(() => getSessionStatus(props.activity))
  const style = computed(() => getSessionStatusStyle(status.value))
  const icon = computed(() => getEntryIcon(props.activity))

  const linkedPlanTitle = computed(() => {
    const title = props.activity.linkedPlannedWorkout?.title?.trim()
    if (!title || title === props.activity.title?.trim()) return ''
    return title
  })

  const metaItems = computed(() => {
    const activity = props.activity
    const items: { label: string; class?: string }[] = []
    const showDetails = props.settings.showSessionDetails

    if (status.value === 'missed') {
      items.push({
        label: t.value('status_missed'),
        class: 'font-medium text-red-600 dark:text-red-400'
      })
    }

    if (showDetails) {
      const startTime =
        activity.source === 'planned' && activity.startTime
          ? formatTime(activity.startTime)
          : activity.source === 'completed' && activity.date
            ? formatTime(activity.date)
            : ''
      if (startTime) items.push({ label: startTime })
    }

    const duration = formatSessionDuration(getSessionDurationSeconds(activity))
    if (duration) items.push({ label: duration })

    const distance = formatSessionDistance(getSessionDistanceMeters(activity), props.distanceUnits)
    if (distance) items.push({ label: distance })

    if (showDetails) {
      if (activity.averageHr) {
        items.push({
          label: `♥ ${Math.round(activity.averageHr)}`,
          class: 'text-red-500 dark:text-red-400'
        })
      }
      const load = activity.tss ?? activity.trimp ?? activity.plannedTss
      if (load) items.push({ label: `${Math.round(load)} TSS` })
    }

    if (status.value === 'note' && activity.category) {
      items.push({ label: activity.category })
    }

    return items
  })

  const menuItems = computed<DropdownMenuItem[][]>(() => {
    const items: DropdownMenuItem[] = []

    if (props.activity.source === 'completed' && props.activity.id) {
      items.push({
        label: props.inComparison
          ? t.value('controls_remove_comparison')
          : t.value('controls_add_comparison'),
        icon: props.inComparison ? 'i-lucide-check' : 'i-lucide-git-compare-arrows',
        onSelect: () => emit('toggle-comparison')
      })
    }

    if (props.activity.source === 'completed' || props.activity.source === 'planned') {
      items.push({
        label:
          props.activity.source === 'planned'
            ? t.value('session_save_plan_to_library')
            : t.value('session_save_to_library'),
        icon: 'i-heroicons-document-plus',
        disabled: props.saving,
        onSelect: () => emit('save-to-library')
      })
    }

    return items.length > 0 ? [items] : []
  })
</script>
