<template>
  <UDashboardPanel id="injuries">
    <template #header>
      <UDashboardNavbar :title="t('page_title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            color="primary"
            size="sm"
            icon="i-lucide-plus"
            :label="t('log_injury')"
            @click="
              () => {
                openCreate()
              }
            "
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        <div>
          <h1 class="text-2xl font-black tracking-tight text-highlighted sm:text-3xl">
            {{ t('page_title') }}
          </h1>
          <p class="mt-1 text-sm text-muted">{{ t('page_subtitle') }}</p>
        </div>

        <div v-if="pending && !data" class="space-y-3">
          <USkeleton class="h-28 w-full rounded-lg" />
          <USkeleton class="h-28 w-full rounded-lg" />
        </div>

        <UAlert
          v-else-if="error"
          color="error"
          variant="soft"
          icon="i-heroicons-exclamation-circle"
          :title="t('load_error_title')"
          :description="t('load_error_desc')"
        >
          <template #actions>
            <UButton
              color="error"
              variant="soft"
              size="xs"
              icon="i-heroicons-arrow-path"
              :label="t('retry')"
              @click="
                () => {
                  void refresh()
                }
              "
            />
          </template>
        </UAlert>

        <template v-else>
          <!-- Empty state -->
          <div
            v-if="activeInjuries.length === 0"
            class="rounded-lg border border-dashed border-default px-6 py-10 text-center"
          >
            <UIcon name="i-heroicons-face-smile" class="mx-auto h-10 w-10 text-success" />
            <p class="mt-3 text-lg font-bold text-highlighted">{{ t('empty_title') }}</p>
            <p class="mx-auto mt-1 max-w-sm text-sm text-muted">{{ t('empty_desc') }}</p>
            <UButton
              class="mt-5 min-h-11"
              color="primary"
              icon="i-lucide-plus"
              :label="t('log_injury')"
              @click="
                () => {
                  openCreate()
                }
              "
            />
          </div>

          <!-- Active & recovering -->
          <section v-else class="space-y-3">
            <h2 class="text-xs font-bold uppercase tracking-widest text-muted">
              {{ t('section_active') }}
            </h2>
            <UCard
              v-for="injury in activeInjuries"
              :key="injury.id"
              :ui="{ root: 'rounded-lg', body: 'p-4 sm:p-5' }"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-base font-bold text-highlighted">
                      {{ areaLabel(injury.bodyArea) }}
                    </h3>
                    <UBadge v-if="injury.side" color="neutral" variant="subtle" size="sm">
                      {{ sideLabel(injury.side) }}
                    </UBadge>
                    <UBadge :color="statusColor(injury.status)" variant="subtle" size="sm">
                      {{ statusLabel(injury.status) }}
                    </UBadge>
                  </div>
                  <p v-if="injury.title" class="mt-0.5 break-words text-sm text-default">
                    {{ injury.title }}
                  </p>
                  <p class="mt-1 text-xs text-muted">{{ sinceLabel(injury) }}</p>
                </div>
                <UDropdownMenu :items="overflowItems(injury)">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-ellipsis-vertical"
                    :aria-label="t('action_more')"
                    class="min-h-11 min-w-11 justify-center"
                  />
                </UDropdownMenu>
              </div>

              <div class="mt-4">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="text-sm font-bold" :class="painTextClass(injury.painLevel)">
                    {{ t('pain_label', { pain: injury.painLevel }) }}
                  </span>
                </div>
                <div class="mt-1.5 flex gap-1" aria-hidden="true">
                  <span
                    v-for="n in 10"
                    :key="n"
                    class="h-1.5 flex-1 rounded-full"
                    :class="n <= injury.painLevel ? painBarClass(injury.painLevel) : 'bg-elevated'"
                  />
                </div>
                <p class="mt-1.5 text-xs text-muted">
                  {{ t(`pain_${getPainBand(injury.painLevel)}`) }}
                </p>
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span class="font-semibold text-muted">{{ t('affects') }}:</span>
                <template v-if="injury.affectedSports.length > 0">
                  <UBadge
                    v-for="sport in injury.affectedSports"
                    :key="sport"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  >
                    {{ t(`sport_${String(sport).toLowerCase()}`) }}
                  </UBadge>
                </template>
                <span v-else class="text-muted">
                  {{ t('affects_inferred', { sports: inferredSportsLabel(injury) }) }}
                </span>
              </div>

              <p
                v-if="injury.notes"
                class="mt-3 whitespace-pre-line break-words rounded-md bg-elevated/60 p-3 text-sm text-default"
              >
                {{ injury.notes }}
              </p>

              <div class="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <UButton
                  color="primary"
                  variant="soft"
                  icon="i-heroicons-adjustments-horizontal"
                  :label="t('action_pain_update')"
                  class="min-h-11 justify-center"
                  @click="
                    () => {
                      openPainUpdate(injury)
                    }
                  "
                />
                <UButton
                  v-if="injury.status === 'ACTIVE'"
                  color="neutral"
                  variant="outline"
                  icon="i-heroicons-arrow-trending-up"
                  :label="t('action_mark_recovering')"
                  :loading="busyId === `${injury.id}:RECOVERING`"
                  class="min-h-11 justify-center"
                  @click="
                    () => {
                      void setStatus(injury, 'RECOVERING')
                    }
                  "
                />
                <UButton
                  color="success"
                  variant="outline"
                  icon="i-heroicons-check-circle"
                  :label="t('action_mark_resolved')"
                  :loading="busyId === `${injury.id}:RESOLVED`"
                  class="min-h-11 justify-center"
                  @click="
                    () => {
                      void setStatus(injury, 'RESOLVED')
                    }
                  "
                />
              </div>
            </UCard>
          </section>

          <!-- Resolved history -->
          <section v-if="resolvedInjuries.length > 0" class="space-y-3">
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :icon="showResolved ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
              :label="
                showResolved
                  ? t('hide_resolved')
                  : t('show_resolved', { count: resolvedInjuries.length })
              "
              class="min-h-11 -ml-2"
              @click="
                () => {
                  showResolved = !showResolved
                }
              "
            />
            <div
              v-if="showResolved"
              class="divide-y divide-default rounded-lg border border-default"
            >
              <div
                v-for="injury in resolvedInjuries"
                :key="injury.id"
                class="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-highlighted">
                    {{ areaLabel(injury.bodyArea)
                    }}<span v-if="injury.side" class="font-normal text-muted">
                      · {{ sideLabel(injury.side) }}</span
                    >
                  </p>
                  <p v-if="injury.title" class="truncate text-xs text-default">
                    {{ injury.title }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ formatCalendarDate(injury.onsetDate) }}
                    <template v-if="injury.resolvedAt">
                      → {{ t('resolved_on', { date: formatTimestamp(injury.resolvedAt) }) }}
                    </template>
                  </p>
                </div>
                <UDropdownMenu :items="overflowItems(injury)">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-ellipsis-vertical"
                    :aria-label="t('action_more')"
                    class="min-h-11 min-w-11 justify-center"
                  />
                </UDropdownMenu>
              </div>
            </div>
          </section>

          <!-- How the coach uses this -->
          <UCard :ui="{ root: 'rounded-lg', body: 'p-4 sm:p-5' }">
            <div class="flex items-start gap-3">
              <UIcon
                name="i-heroicons-information-circle"
                class="mt-0.5 h-5 w-5 shrink-0 text-primary"
              />
              <div class="min-w-0 space-y-3 text-sm">
                <h2 class="font-bold text-highlighted">{{ t('explainer_title') }}</h2>
                <p class="text-default">{{ t('explainer_body') }}</p>
                <p class="font-semibold text-default">{{ t('explainer_disclaimer') }}</p>
                <ul class="list-disc space-y-1 pl-5 text-muted">
                  <li>{{ t('red_flag_sharp') }}</li>
                  <li>{{ t('red_flag_swelling') }}</li>
                  <li>{{ t('red_flag_night') }}</li>
                  <li>{{ t('red_flag_gait') }}</li>
                  <li>{{ t('red_flag_bone') }}</li>
                </ul>
              </div>
            </div>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>

  <InjuryFormModal
    :open="isFormOpen"
    :injury="editingInjury"
    :saving="saving"
    @update:open="isFormOpen = $event"
    @submit="
      (payload) => {
        void saveInjury(payload)
      }
    "
  />

  <InjuryPainUpdateModal
    :open="isPainOpen"
    :pain-level="painInjury?.painLevel ?? 3"
    :saving="saving"
    @update:open="isPainOpen = $event"
    @submit="
      (payload) => {
        void savePainUpdate(payload)
      }
    "
  />

  <UModal v-model:open="isDeleteOpen" :title="t('action_delete')" :ui="{ content: 'sm:max-w-sm' }">
    <template #body>
      <p class="text-sm text-default">{{ t('confirm_delete') }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('cancel')"
          @click="
            () => {
              isDeleteOpen = false
            }
          "
        />
        <UButton
          color="error"
          :label="t('action_delete')"
          :loading="saving"
          @click="
            () => {
              void confirmDelete()
            }
          "
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import InjuryFormModal from '~/components/injuries/InjuryFormModal.vue'
  import InjuryPainUpdateModal from '~/components/injuries/InjuryPainUpdateModal.vue'
  import {
    getEffectiveAffectedSports,
    getPainBand,
    type InjuryDTO,
    type InjuryFormPayload,
    type InjuryStatus
  } from '#shared/injuries'

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })

  const { t } = useTranslate('injuries')
  const toast = useToast()

  useHead({ title: computed(() => t.value('page_title')) })

  // ($fetch as any) avoids Nitro's typed-route inference blowing the type depth limit.
  const api = $fetch as any
  const { data, pending, error, refresh } = useAsyncData<{ injuries: InjuryDTO[] }>(
    'injuries-all',
    () => api('/api/injuries', { query: { status: 'all' } }),
    { lazy: true }
  )

  const injuries = computed(() => data.value?.injuries || [])
  const activeInjuries = computed(() =>
    injuries.value.filter((injury) => injury.status !== 'RESOLVED')
  )
  const resolvedInjuries = computed(() =>
    injuries.value.filter((injury) => injury.status === 'RESOLVED')
  )

  const showResolved = ref(false)
  const saving = ref(false)
  const busyId = ref<string | null>(null)

  const isFormOpen = ref(false)
  const editingInjury = ref<InjuryDTO | null>(null)
  const isPainOpen = ref(false)
  const painInjury = ref<InjuryDTO | null>(null)
  const isDeleteOpen = ref(false)
  const deletingInjury = ref<InjuryDTO | null>(null)

  function areaLabel(area: string) {
    return t.value(`area_${area}`)
  }

  function sideLabel(side: string) {
    return t.value(`side_${side.toLowerCase()}`)
  }

  function statusLabel(status: string) {
    return t.value(`status_${status.toLowerCase()}`)
  }

  function statusColor(status: string): 'error' | 'warning' | 'success' {
    if (status === 'ACTIVE') return 'error'
    if (status === 'RECOVERING') return 'warning'
    return 'success'
  }

  function painTextClass(pain: number) {
    const band = getPainBand(pain)
    if (band === 'severe') return 'text-error'
    if (band === 'moderate') return 'text-warning'
    return 'text-success'
  }

  function painBarClass(pain: number) {
    const band = getPainBand(pain)
    if (band === 'severe') return 'bg-error'
    if (band === 'moderate') return 'bg-warning'
    return 'bg-success'
  }

  function inferredSportsLabel(injury: InjuryDTO) {
    return getEffectiveAffectedSports(injury)
      .sports.map((sport) => t.value(`sport_${sport}`))
      .join(', ')
  }

  const calendarFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })
  const timestampFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  })

  /** onsetDate is a calendar date stored at UTC midnight. */
  function formatCalendarDate(value: string) {
    return calendarFormatter.format(new Date(value))
  }

  function formatTimestamp(value: string) {
    return timestampFormatter.format(new Date(value))
  }

  function daysSince(onsetDate: string) {
    const now = new Date()
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    const onset = new Date(onsetDate)
    const onsetDay = Date.UTC(onset.getUTCFullYear(), onset.getUTCMonth(), onset.getUTCDate())
    return Math.max(0, Math.round((today - onsetDay) / 86_400_000))
  }

  function sinceLabel(injury: InjuryDTO) {
    const days = daysSince(injury.onsetDate)
    if (days === 0) return t.value('since_today')
    return t.value('since_days', { date: formatCalendarDate(injury.onsetDate), days })
  }

  function overflowItems(injury: InjuryDTO) {
    const items: Array<{ label: string; icon: string; color?: 'error'; onSelect: () => void }> = [
      {
        label: t.value('action_edit'),
        icon: 'i-heroicons-pencil-square',
        onSelect: () => openEdit(injury)
      }
    ]
    if (injury.status === 'RESOLVED') {
      items.push({
        label: t.value('action_reopen'),
        icon: 'i-heroicons-arrow-uturn-left',
        onSelect: () => {
          void setStatus(injury, 'ACTIVE')
        }
      })
    }
    items.push({
      label: t.value('action_delete'),
      icon: 'i-heroicons-trash',
      color: 'error',
      onSelect: () => {
        deletingInjury.value = injury
        isDeleteOpen.value = true
      }
    })
    return [items]
  }

  function openCreate() {
    editingInjury.value = null
    isFormOpen.value = true
  }

  function openEdit(injury: InjuryDTO) {
    editingInjury.value = injury
    isFormOpen.value = true
  }

  function openPainUpdate(injury: InjuryDTO) {
    painInjury.value = injury
    isPainOpen.value = true
  }

  function notifyError() {
    toast.add({ title: t.value('toast_error'), color: 'error', icon: 'i-heroicons-x-circle' })
  }

  async function saveInjury(payload: InjuryFormPayload) {
    saving.value = true
    try {
      if (editingInjury.value) {
        await api(`/api/injuries/${editingInjury.value.id}`, { method: 'PATCH', body: payload })
      } else {
        await api('/api/injuries', { method: 'POST', body: payload })
      }
      isFormOpen.value = false
      toast.add({ title: t.value('toast_saved'), color: 'success', icon: 'i-heroicons-check' })
      await refresh()
    } catch {
      notifyError()
    } finally {
      saving.value = false
    }
  }

  async function savePainUpdate(payload: { painLevel: number; note: string }) {
    const injury = painInjury.value
    if (!injury) return
    saving.value = true
    try {
      const body: Record<string, unknown> = { painLevel: payload.painLevel }
      if (payload.note) {
        const stamp = `${formatTimestamp(new Date().toISOString())}: ${payload.note}`
        body.notes = injury.notes ? `${injury.notes}\n${stamp}` : stamp
      }
      await api(`/api/injuries/${injury.id}`, { method: 'PATCH', body })
      isPainOpen.value = false
      toast.add({ title: t.value('toast_saved'), color: 'success', icon: 'i-heroicons-check' })
      await refresh()
    } catch {
      notifyError()
    } finally {
      saving.value = false
    }
  }

  async function setStatus(injury: InjuryDTO, status: InjuryStatus) {
    busyId.value = `${injury.id}:${status}`
    try {
      await api(`/api/injuries/${injury.id}`, { method: 'PATCH', body: { status } })
      toast.add({
        title:
          status === 'RESOLVED'
            ? t.value('toast_resolved')
            : status === 'RECOVERING'
              ? t.value('toast_recovering')
              : t.value('toast_saved'),
        color: 'success',
        icon: 'i-heroicons-check'
      })
      await refresh()
    } catch {
      notifyError()
    } finally {
      busyId.value = null
    }
  }

  async function confirmDelete() {
    const injury = deletingInjury.value
    if (!injury) return
    saving.value = true
    try {
      await api(`/api/injuries/${injury.id}`, { method: 'DELETE' })
      isDeleteOpen.value = false
      toast.add({ title: t.value('toast_deleted'), color: 'neutral', icon: 'i-heroicons-trash' })
      await refresh()
    } catch {
      notifyError()
    } finally {
      saving.value = false
    }
  }
</script>
