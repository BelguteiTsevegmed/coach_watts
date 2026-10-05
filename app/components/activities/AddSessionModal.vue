<template>
  <UModal
    v-model:open="isOpen"
    :title="t('add_session_title')"
    :description="t('add_session_description')"
  >
    <template #body>
      <form
        id="add-session-form"
        class="space-y-5"
        data-testid="add-session-form"
        @submit.prevent="
          () => {
            void submit()
          }
        "
      >
        <UFormField :label="t('add_session_sport')">
          <div class="grid grid-cols-5 gap-1.5" role="radiogroup">
            <button
              v-for="option in sportOptions"
              :key="option.type"
              type="button"
              role="radio"
              :aria-checked="form.type === option.type"
              class="flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs font-medium transition-colors"
              :class="
                form.type === option.type
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
              "
              @click="selectSport(option.type)"
            >
              <UIcon :name="getSessionIcon(option.type)" class="size-5" />
              {{ option.label }}
            </button>
          </div>
        </UFormField>

        <UFormField :label="t('add_session_name')">
          <UInput
            v-model="form.title"
            :placeholder="defaultTitle"
            class="w-full"
            data-testid="add-session-title"
          />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField :label="t('add_session_date')">
            <UInput
              v-model="form.date"
              type="date"
              required
              class="w-full"
              data-testid="add-session-date"
            />
          </UFormField>
          <UFormField :label="t('add_session_duration')">
            <UInput
              v-model.number="form.durationMinutes"
              type="number"
              min="5"
              max="600"
              step="5"
              class="w-full"
              data-testid="add-session-duration"
            >
              <template #trailing>
                <span class="text-xs text-muted">{{ t('add_session_minutes') }}</span>
              </template>
            </UInput>
          </UFormField>
        </div>

        <UFormField :label="t('add_session_notes')" :hint="t('add_session_optional')">
          <UTextarea
            v-model="form.description"
            :rows="3"
            :placeholder="t('add_session_notes_placeholder')"
            class="w-full"
          />
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div
        class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <UButton
          color="neutral"
          variant="link"
          icon="i-heroicons-rectangle-stack"
          class="justify-center px-0"
          @click="
            () => {
              isOpen = false
              emit('open-library')
            }
          "
        >
          {{ t('add_session_from_library') }}
        </UButton>
        <div class="flex gap-2 justify-end">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="saving"
            @click="
              () => {
                isOpen = false
              }
            "
          >
            {{ t('add_session_cancel') }}
          </UButton>
          <UButton
            type="submit"
            form="add-session-form"
            color="primary"
            :loading="saving"
            :disabled="!canSubmit"
            data-testid="add-session-submit"
          >
            {{ t('add_session_submit') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { getSessionIcon } from '~/utils/calendarDisplay'

  const props = withDefaults(
    defineProps<{
      /** yyyy-MM-dd the form starts on. */
      initialDate: string
      /** Sport to preselect (the athlete's most common recent type). */
      initialType?: string
    }>(),
    { initialType: 'Run' }
  )

  const emit = defineEmits<{
    created: [workout: any]
    'open-library': []
  }>()

  const isOpen = defineModel<boolean>('open', { default: false })
  const { t } = useTranslate('activities')
  const toast = useToast()

  const sportOptions = computed(() => [
    { type: 'Run', label: t.value('add_session_sport_run') },
    { type: 'Ride', label: t.value('add_session_sport_ride') },
    { type: 'Swim', label: t.value('add_session_sport_swim') },
    { type: 'WeightTraining', label: t.value('add_session_sport_strength') },
    { type: 'Workout', label: t.value('add_session_sport_other') }
  ])

  const KNOWN_TYPES = ['Run', 'Ride', 'Swim', 'WeightTraining', 'Workout']

  function normalizeType(type?: string | null) {
    if (type && KNOWN_TYPES.includes(type)) return type
    const value = (type || '').toLowerCase()
    if (value.includes('run')) return 'Run'
    if (value.includes('ride') || value.includes('bike') || value.includes('cycl')) return 'Ride'
    if (value.includes('swim')) return 'Swim'
    if (value.includes('weight') || value.includes('strength') || value.includes('gym'))
      return 'WeightTraining'
    return 'Run'
  }

  function emptyForm() {
    return {
      type: normalizeType(props.initialType),
      title: '',
      date: props.initialDate,
      durationMinutes: 45 as number | string,
      description: ''
    }
  }

  const form = ref(emptyForm())
  const saving = ref(false)

  watch(isOpen, (open) => {
    if (open) form.value = emptyForm()
  })

  function selectSport(type: string) {
    form.value.type = type
  }

  const defaultTitle = computed(
    () => sportOptions.value.find((option) => option.type === form.value.type)?.label || ''
  )

  const durationSeconds = computed(() => {
    const minutes = Number(form.value.durationMinutes)
    return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0
  })

  const canSubmit = computed(
    () => /^\d{4}-\d{2}-\d{2}$/.test(form.value.date || '') && durationSeconds.value > 0
  )

  async function submit() {
    if (!canSubmit.value || saving.value) return
    saving.value = true
    try {
      const response = await ($fetch as any)('/api/planned-workouts', {
        method: 'POST',
        body: {
          date: form.value.date,
          title: form.value.title.trim() || defaultTitle.value,
          type: form.value.type,
          durationSec: durationSeconds.value,
          description: form.value.description.trim() || undefined
        }
      })
      toast.add({
        title: t.value('add_session_added'),
        color: 'success'
      })
      emit('created', response?.workout)
      isOpen.value = false
    } catch (error: any) {
      toast.add({
        title: t.value('add_session_failed'),
        description: error?.data?.message || error?.message,
        color: 'error'
      })
    } finally {
      saving.value = false
    }
  }
</script>
