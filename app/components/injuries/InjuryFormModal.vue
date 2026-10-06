<template>
  <UModal
    v-model:open="isOpen"
    :title="injury ? t('form_title_edit') : t('form_title_new')"
    :description="t('form_desc')"
    :ui="{ content: 'sm:max-w-lg' }"
  >
    <template #body>
      <form
        class="space-y-5"
        @submit.prevent="
          () => {
            submit()
          }
        "
      >
        <UFormField :label="t('field_body_area')" name="bodyArea" required>
          <USelect
            v-model="form.bodyArea"
            :items="bodyAreaItems"
            :placeholder="t('field_body_area_placeholder')"
            class="w-full"
            size="lg"
          />
        </UFormField>

        <UFormField :label="t('field_side')" name="side">
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <UButton
              v-for="option in sideItems"
              :key="option.value"
              :label="option.label"
              :color="form.side === option.value ? 'primary' : 'neutral'"
              :variant="form.side === option.value ? 'solid' : 'outline'"
              class="min-h-11 justify-center"
              @click="
                () => {
                  form.side = option.value
                }
              "
            />
          </div>
        </UFormField>

        <UFormField :label="t('field_pain')" name="painLevel" :help="t('field_pain_help')">
          <div class="flex items-center gap-4">
            <span
              class="w-12 shrink-0 text-center text-3xl font-black tabular-nums"
              :class="painColorClass(form.painLevel)"
            >
              {{ form.painLevel }}
            </span>
            <USlider
              v-model="form.painLevel"
              :min="0"
              :max="10"
              :step="1"
              :color="painSliderColor(form.painLevel)"
              class="flex-1"
            />
          </div>
          <p class="mt-2 text-xs text-muted">{{ painBandLabel(form.painLevel) }}</p>
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="t('field_onset')" name="onsetDate" required>
            <UInput v-model="form.onsetDate" type="date" :max="todayKey" class="w-full" />
          </UFormField>
          <UFormField v-if="injury" :label="t('field_status')" name="status">
            <USelect v-model="form.status" :items="statusItems" class="w-full" />
          </UFormField>
        </div>

        <UFormField :label="t('field_title')" name="title">
          <UInput
            v-model="form.title"
            :placeholder="t('field_title_placeholder')"
            maxlength="120"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('field_sports')" name="affectedSports" :help="t('field_sports_help')">
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="sport in INJURY_SPORTS"
              :key="sport"
              :label="t(`sport_${sport}`)"
              :icon="form.affectedSports.includes(sport) ? 'i-heroicons-check' : undefined"
              :color="form.affectedSports.includes(sport) ? 'primary' : 'neutral'"
              :variant="form.affectedSports.includes(sport) ? 'soft' : 'outline'"
              class="min-h-11"
              @click="
                () => {
                  toggleSport(sport)
                }
              "
            />
          </div>
        </UFormField>

        <UFormField :label="t('field_notes')" name="notes">
          <UTextarea
            v-model="form.notes"
            :placeholder="t('field_notes_placeholder')"
            :rows="3"
            maxlength="2000"
            class="w-full"
          />
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('cancel')"
          @click="
            () => {
              isOpen = false
            }
          "
        />
        <UButton
          color="primary"
          :label="t('save')"
          :loading="saving"
          :disabled="!form.bodyArea || !form.onsetDate"
          @click="
            () => {
              submit()
            }
          "
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import {
    INJURY_BODY_AREAS,
    INJURY_SPORTS,
    getPainBand,
    type InjuryDTO,
    type InjuryFormPayload,
    type InjurySport,
    type InjuryStatus
  } from '#shared/injuries'

  const props = defineProps<{
    open: boolean
    injury?: InjuryDTO | null
    saving?: boolean
  }>()

  const emit = defineEmits<{
    'update:open': [value: boolean]
    submit: [payload: InjuryFormPayload]
  }>()

  const { t } = useTranslate('injuries')

  const isOpen = computed({
    get: () => props.open,
    set: (value: boolean) => emit('update:open', value)
  })

  function localDateKey(date = new Date()) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const todayKey = computed(() => localDateKey())

  type SideValue = 'NONE' | 'LEFT' | 'RIGHT' | 'BOTH'

  const form = reactive({
    bodyArea: '' as string,
    side: 'NONE' as SideValue,
    title: '',
    painLevel: 3,
    onsetDate: localDateKey(),
    status: 'ACTIVE' as InjuryStatus,
    affectedSports: [] as string[],
    notes: ''
  })

  function resetForm() {
    const injury = props.injury
    form.bodyArea = injury?.bodyArea || ''
    form.side = (injury?.side as SideValue) || 'NONE'
    form.title = injury?.title || ''
    form.painLevel = injury?.painLevel ?? 3
    // onsetDate is a calendar date stored at UTC midnight
    form.onsetDate = injury?.onsetDate ? injury.onsetDate.slice(0, 10) : localDateKey()
    form.status = injury?.status || 'ACTIVE'
    form.affectedSports = [...(injury?.affectedSports || [])]
    form.notes = injury?.notes || ''
  }

  watch(
    () => [props.open, props.injury?.id],
    ([open]) => {
      if (open) resetForm()
    },
    { immediate: true }
  )

  const bodyAreaItems = computed(() =>
    INJURY_BODY_AREAS.map((area) => ({ label: t.value(`area_${area}`), value: area as string }))
  )

  const sideItems = computed(() => [
    { label: t.value('side_none'), value: 'NONE' as SideValue },
    { label: t.value('side_left'), value: 'LEFT' as SideValue },
    { label: t.value('side_right'), value: 'RIGHT' as SideValue },
    { label: t.value('side_both'), value: 'BOTH' as SideValue }
  ])

  const statusItems = computed(() => [
    { label: t.value('status_active'), value: 'ACTIVE' },
    { label: t.value('status_recovering'), value: 'RECOVERING' },
    { label: t.value('status_resolved'), value: 'RESOLVED' }
  ])

  function toggleSport(sport: InjurySport) {
    form.affectedSports = form.affectedSports.includes(sport)
      ? form.affectedSports.filter((value) => value !== sport)
      : [...form.affectedSports, sport]
  }

  function painBandLabel(pain: number) {
    return t.value(`pain_${getPainBand(pain)}`)
  }

  function painColorClass(pain: number) {
    const band = getPainBand(pain)
    if (band === 'severe') return 'text-error'
    if (band === 'moderate') return 'text-warning'
    return 'text-success'
  }

  function painSliderColor(pain: number): 'success' | 'warning' | 'error' {
    const band = getPainBand(pain)
    if (band === 'severe') return 'error'
    if (band === 'moderate') return 'warning'
    return 'success'
  }

  function submit() {
    if (!form.bodyArea || !form.onsetDate) return
    emit('submit', {
      bodyArea: form.bodyArea,
      side: form.side === 'NONE' ? null : form.side,
      title: form.title.trim() || null,
      painLevel: form.painLevel,
      onsetDate: form.onsetDate,
      ...(props.injury ? { status: form.status } : {}),
      affectedSports: form.affectedSports,
      notes: form.notes.trim() || null
    })
  }
</script>
