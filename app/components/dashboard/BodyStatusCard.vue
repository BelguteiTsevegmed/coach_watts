<template>
  <UCard :ui="cardUi" data-testid="today-body-status">
    <div class="flex items-center justify-between gap-3">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
        <UIcon name="i-heroicons-shield-check" class="size-5 text-primary" />
        {{ t('today_body_title') }}
      </h3>
      <UButton
        v-if="injuries.length"
        to="/injuries"
        color="neutral"
        variant="link"
        size="xs"
        trailing-icon="i-heroicons-arrow-right"
        class="px-0"
        @click="trackWidgetClick('today_body_status', 'manage')"
      >
        {{ t('today_body_manage') }}
      </UButton>
    </div>

    <div v-if="loading" class="mt-4 space-y-2">
      <USkeleton class="h-4 w-3/4" />
      <USkeleton class="h-4 w-1/2" />
    </div>

    <template v-else-if="injuries.length">
      <ul class="mt-3 divide-y divide-default">
        <li v-for="injury in injuries" :key="injury.id">
          <NuxtLink
            to="/injuries"
            class="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-elevated/60"
          >
            <span
              class="size-2.5 shrink-0 rounded-full"
              :class="painDotClass(injury.painLevel)"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-highlighted">
                {{ injuryName(injury) }}
              </span>
              <span class="block text-xs text-muted">{{ injuryMeta(injury) }}</span>
            </span>
          </NuxtLink>
        </li>
      </ul>
      <p class="mt-3 flex items-start gap-2 text-xs text-muted">
        <UIcon name="i-heroicons-sparkles" class="mt-px size-4 shrink-0 text-primary" />
        {{ t('today_body_adapts') }}
      </p>
    </template>

    <div v-else class="mt-3">
      <p class="text-sm font-medium text-highlighted">{{ t('today_body_empty') }}</p>
      <p class="mt-1 text-sm text-muted">{{ t('today_body_empty_desc') }}</p>
      <UButton
        to="/injuries"
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-heroicons-plus"
        class="mt-3"
        data-testid="today-body-report"
        @click="trackWidgetClick('today_body_status', 'report')"
      >
        {{ t('today_body_report') }}
      </UButton>
    </div>

    <NuxtLink
      to="/recovery"
      class="mt-4 block border-t border-default pt-3 text-xs text-muted hover:text-highlighted"
    >
      {{ t('today_body_other_context') }}
      <UIcon name="i-heroicons-arrow-right" class="ms-0.5 inline size-3 align-[-1px]" />
    </NuxtLink>
  </UCard>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { daysBetweenKeys, utcDateKey } from '~/utils/today-plan'

  /** Contract of `GET /api/injuries?status=active`. */
  interface ActiveInjury {
    id: string
    bodyArea: string
    side?: string | null
    title?: string | null
    painLevel?: number | null
    status: 'ACTIVE' | 'RECOVERING' | string
    onsetDate?: string | null
  }

  const props = defineProps<{
    todayKey: string
  }>()

  const { t } = useTranslate('dashboard')
  const { trackWidgetClick } = useAnalytics()

  const cardUi = {
    root: 'rounded-none sm:rounded-xl shadow-none sm:shadow-sm ring-0 sm:ring ring-default border-y border-default sm:border-y-0',
    body: 'p-4 sm:p-6'
  }

  const injuries = ref<ActiveInjury[]>([])
  const loading = ref(true)

  async function refresh() {
    try {
      const data = (await ($fetch as any)('/api/injuries', {
        query: { status: 'active' }
      })) as { injuries?: ActiveInjury[] } | null
      injuries.value = Array.isArray(data?.injuries) ? data.injuries : []
    } catch {
      // The endpoint may not exist yet or may fail; an empty state is the
      // honest fallback — never show an error here.
      injuries.value = []
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void refresh()
  })

  defineExpose({ refresh })

  function humanize(value: string) {
    const text = value.replace(/[_-]+/g, ' ').trim().toLowerCase()
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  function sideLabel(side?: string | null) {
    const value = String(side || '').toUpperCase()
    if (value === 'LEFT') return t.value('today_body_side_left')
    if (value === 'RIGHT') return t.value('today_body_side_right')
    if (value === 'BOTH' || value === 'BILATERAL') return t.value('today_body_side_both')
    return ''
  }

  function injuryName(injury: ActiveInjury) {
    const area = injury.bodyArea ? humanize(injury.bodyArea) : injury.title || ''
    const side = sideLabel(injury.side)
    if (!side) return area
    // "Left achilles" reads better than "Left Achilles"; "Both sides · Calf" for bilateral.
    return String(injury.side).toUpperCase() === 'LEFT' ||
      String(injury.side).toUpperCase() === 'RIGHT'
      ? `${side} ${area.toLowerCase()}`
      : `${area} · ${side.toLowerCase()}`
  }

  function injuryMeta(injury: ActiveInjury) {
    const parts: string[] = []
    if (injury.painLevel !== null && injury.painLevel !== undefined) {
      parts.push(t.value('today_body_pain', { level: Math.round(injury.painLevel) }))
    }
    const status = String(injury.status || '').toUpperCase()
    if (status === 'RECOVERING') parts.push(t.value('today_body_status_recovering'))
    else if (status === 'ACTIVE') parts.push(t.value('today_body_status_active'))
    const onsetKey = utcDateKey(injury.onsetDate)
    if (onsetKey) {
      const days = Math.max(0, daysBetweenKeys(onsetKey, props.todayKey))
      parts.push(t.value('today_body_days', { count: days }))
    }
    return parts.join(' · ')
  }

  function painDotClass(level?: number | null) {
    const value = level ?? 0
    if (value >= 6) return 'bg-error'
    if (value >= 4) return 'bg-warning'
    return 'bg-success'
  }
</script>
