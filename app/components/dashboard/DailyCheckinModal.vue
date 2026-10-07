<template>
  <UModal
    v-model:open="isOpen"
    :title="tr('daily_checkin_title', 'Daily check-in')"
    :description="
      tr(
        'journey_checkin_modal_description',
        'A few questions, one at a time. Add anything else your coach should know at the end.'
      )
    "
  >
    <template #body>
      <div class="checkin-journey">
        <div
          v-if="!error && (loading || (isPending && localQuestions.length === 0))"
          class="py-10 space-y-4"
          role="status"
        >
          <UIcon name="i-heroicons-arrow-path" class="size-5 animate-spin text-primary" />
          <p class="text-sm text-muted">
            {{ tr('journey_checkin_preparing', 'Preparing your check-in…') }}
          </p>
          <p v-if="showManualRefresh" class="text-sm text-muted leading-relaxed">
            {{
              tr(
                'journey_checkin_slow',
                'This is taking longer than usual. You can close this window and return later.'
              )
            }}
          </p>
          <UButton v-if="showManualRefresh" color="neutral" variant="link" @click="fetchToday()">{{
            tr('daily_checkin_retry_label', 'Try loading again')
          }}</UButton>
        </div>
        <div v-else-if="error || checkin?.status === 'FAILED'" class="py-6">
          <p role="alert" class="text-sm leading-relaxed">
            {{
              error ||
              checkin?.error ||
              tr('daily_checkin_generation_failed', 'Your check-in could not load.')
            }}
          </p>
          <UButton color="primary" class="mt-5" @click="generate(true)">{{
            tr('daily_checkin_try_again', 'Try again')
          }}</UButton>
        </div>
        <template v-else-if="localQuestions.length">
          <p v-if="checkin?.date" class="text-sm text-muted mb-6">
            {{ formatDateUTC(checkin.date, 'EEEE, MMM d') }}
          </p>
          <p v-if="isPending" class="mb-4 text-sm text-muted" role="status">
            {{ tr('daily_checkin_refreshing', 'Refreshing check-in…') }}
          </p>
          <section v-if="currentQuestion" :key="currentQuestion.id" aria-live="polite">
            <p class="text-sm text-muted mb-3">
              {{
                tr('journey_checkin_question_count', 'Question {current} of {total}', {
                  current: questionIndex + 1,
                  total: localQuestions.length
                })
              }}
            </p>
            <h2 ref="stepHeading" tabindex="-1" class="checkin-journey__question">
              {{ currentQuestion.text }}
            </h2>
            <URadioGroup
              v-model="answers[currentQuestion.id]"
              :name="currentQuestion.id"
              class="mt-7"
              :items="[
                { label: tr('daily_checkin_answer_yes', 'Yes'), value: 'YES' },
                { label: tr('daily_checkin_answer_no', 'No'), value: 'NO' }
              ]"
            />
            <details class="checkin-journey__disclosure mt-6">
              <summary>{{ tr('journey_checkin_question_options', 'Question options') }}</summary>
              <div class="flex flex-wrap gap-3 py-3">
                <UButton
                  v-if="answers[currentQuestion.id]"
                  color="neutral"
                  variant="link"
                  size="sm"
                  @click="clearAnswer(currentQuestion.id)"
                  >{{ tr('journey_checkin_clear_answer', 'Clear answer') }}</UButton
                >
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  @click="removeQuestion(currentQuestion.id)"
                  >{{ tr('daily_checkin_remove_question', 'Remove question') }}</UButton
                >
              </div>
            </details>
            <details v-if="currentQuestion.reasoning" class="checkin-journey__disclosure mt-7">
              <summary>{{ tr('journey_checkin_why', 'Why this question?') }}</summary>
              <p class="text-sm text-muted leading-relaxed pt-2 pb-4">
                {{ currentQuestion.reasoning }}
              </p>
            </details>
          </section>
          <section v-else>
            <h2 ref="stepHeading" tabindex="-1" class="checkin-journey__question">
              {{ tr('journey_checkin_notes_title', 'Anything else on your mind?') }}
            </h2>
            <p class="mt-3 text-sm text-muted leading-relaxed">
              {{
                tr(
                  'journey_checkin_notes_description',
                  'Add how you’re feeling, a change in your plans, or something your coach should consider. This is optional.'
                )
              }}
            </p>
            <UFormField
              :label="tr('journey_checkin_notes_label', 'Your notes')"
              name="checkin-notes"
              class="mt-6"
            >
              <UTextarea
                v-model="userNotes"
                :rows="3"
                autoresize
                class="w-full"
                :placeholder="
                  tr(
                    'journey_checkin_notes_placeholder',
                    'For example, I slept poorly or have less time today.'
                  )
                "
              />
            </UFormField>
            <details class="checkin-journey__disclosure mt-6">
              <summary>{{ tr('journey_checkin_review', 'Review your answers') }}</summary>
              <dl class="py-3 space-y-4">
                <div
                  v-for="question in localQuestions"
                  :key="question.id"
                  class="flex gap-4 justify-between text-sm"
                >
                  <dt class="text-muted">{{ question.text }}</dt>
                  <dd class="font-medium shrink-0">
                    {{
                      answers[question.id] === 'YES'
                        ? tr('daily_checkin_answer_yes', 'Yes')
                        : answers[question.id] === 'NO'
                          ? tr('daily_checkin_answer_no', 'No')
                          : tr('journey_checkin_unanswered', 'Not answered')
                    }}
                  </dd>
                </div>
              </dl>
            </details>
            <p v-if="unansweredCount" class="mt-4 text-sm text-muted">
              {{
                tr(
                  'journey_checkin_unanswered_description',
                  'Unanswered questions stay open. You can return to them later.'
                )
              }}
            </p>
          </section>
          <p v-if="submitError" role="alert" class="text-sm text-error mt-5">{{ submitError }}</p>
        </template>
        <div v-else class="py-6">
          <p class="text-sm text-muted">
            {{ tr('daily_checkin_no_questions', 'Your check-in has no questions yet.') }}
          </p>
          <UButton class="mt-5" @click="generate(true)">{{
            tr('daily_checkin_generate', 'Prepare my check-in')
          }}</UButton>
        </div>

        <details v-if="!loading && !isPending" class="checkin-journey__disclosure mt-8">
          <summary>{{ tr('journey_checkin_more', 'Earlier check-ins and options') }}</summary>
          <div class="py-4 space-y-5">
            <p v-if="checkin?.openingRemark" class="text-sm text-muted leading-relaxed">
              {{ checkin.openingRemark }}
            </p>
            <div v-if="recentCheckins.length" class="divide-y divide-default">
              <button
                v-for="entry in recentCheckins"
                :key="entry.id"
                type="button"
                class="w-full py-3 text-left"
                @click="loadCheckinIntoEditor(entry)"
              >
                <span class="block text-sm font-medium">{{
                  formatDateUTC(entry.date, 'EEE, MMM d')
                }}</span>
                <span class="block mt-1 text-xs text-muted">{{
                  summarizeCheckin(entry).slice(0, 2).join('. ') ||
                  tr('daily_checkin_no_answers', 'No answers saved')
                }}</span>
              </button>
            </div>
            <div class="flex flex-wrap gap-3">
              <UButton
                color="neutral"
                variant="outline"
                @click="
                  handleLockedAction({
                    operation: 'daily_checkin',
                    featureTitle: 'Daily check-in',
                    onAllowed: () => generate(true)
                  })
                "
                >{{ tr('daily_checkin_regenerate', 'Refresh questions') }}</UButton
              >
              <UButton
                v-if="checkin?.id && checkin?.status === 'COMPLETED'"
                color="error"
                variant="link"
                :loading="deleting"
                @click="deleteCheckin"
                >{{ tr('daily_checkin_delete', 'Delete check-in') }}</UButton
              >
            </div>
            <AiFeedback
              v-if="checkin?.llmUsageId"
              :llm-usage-id="checkin.llmUsageId"
              :initial-feedback="checkin.feedback"
              :initial-feedback-text="checkin.feedbackText"
            />
          </div>
        </details>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <UButton
          v-if="questionIndex > 0 && localQuestions.length && !loading"
          color="neutral"
          variant="ghost"
          :disabled="submitting"
          @click="previousStep"
          >{{ tr('journey_checkin_back', 'Back') }}</UButton
        >
        <UButton
          v-else
          color="neutral"
          variant="ghost"
          @click="
            () => {
              isOpen = false
            }
          "
          >{{ tr('daily_checkin_close', 'Close') }}</UButton
        >
        <UButton v-if="currentQuestion && !loading && !error" @click="continueCheckin">{{
          tr('journey_checkin_next', 'Next')
        }}</UButton>
        <UButton
          v-else-if="localQuestions.length && !loading && !error"
          :disabled="!canSave"
          :loading="submitting"
          @click="submit"
          >{{ tr('daily_checkin_save', 'Save check-in') }}</UButton
        >
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { useIntervalFn } from '@vueuse/core'
  import { useTranslate } from '@tolgee/vue'

  const { t } = useTranslate('dashboard')
  const tr = (key: string, fallback: string, params?: Record<string, any>) => {
    if (typeof t.value !== 'function') return fallback
    const translated = t.value(key, params)
    return translated === key ? fallback : translated
  }

  const props = defineProps<{
    open: boolean
  }>()

  const emit = defineEmits(['update:open'])

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value)
  })

  const loading = ref(false)
  const submitting = ref(false)
  const showManualRefresh = ref(false)
  const error = ref<string | null>(null)
  const checkin = ref<any>(null)
  const answers = ref<Record<string, string>>({})
  const userNotes = ref('')
  const localQuestions = ref<any[]>([])
  const questionIndex = ref(0)
  const stepHeading = ref<HTMLElement | null>(null)
  const submitError = ref<string | null>(null)
  const currentQuestion = computed(() => localQuestions.value[questionIndex.value] ?? null)
  const canSave = computed(() => localQuestions.value.length > 0)
  const unansweredCount = computed(
    () => localQuestions.value.filter((question) => !answers.value[question.id]).length
  )

  function moveToFirstUnanswered() {
    const unanswered = localQuestions.value.findIndex((question) => !answers.value[question.id])
    questionIndex.value = unanswered < 0 ? localQuestions.value.length : unanswered
  }

  function continueCheckin() {
    if (currentQuestion.value) questionIndex.value += 1
  }

  function previousStep() {
    questionIndex.value = Math.max(0, questionIndex.value - 1)
  }

  function clearAnswer(id: string) {
    const remainingAnswers = { ...answers.value }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete remainingAnswers[id]
    answers.value = remainingAnswers
  }

  function removeQuestion(id: string) {
    localQuestions.value = localQuestions.value.filter((question) => question.id !== id)
    clearAnswer(id)
    questionIndex.value = Math.min(questionIndex.value, localQuestions.value.length)
    void nextTick().then(() => stepHeading.value?.focus())
  }

  watch(questionIndex, async () => {
    await nextTick()
    stepHeading.value?.focus()
  })
  const recentCheckins = ref<any[]>([])
  const deleting = ref(false)
  const { handleLockedAction } = useQuotaPaywall()
  const toast = useToast()
  const { formatDateUTC } = useFormat()
  const { trackDailyCheckinStart, trackDailyCheckinComplete } = useAnalytics()

  const { start: startMessages, stop: stopMessages } = useLoadingMessages('daily-checkin')

  const isPending = computed(() => {
    return checkin.value?.status === 'PENDING' || checkin.value?.status === 'PROCESSING'
  })
  watch(
    () => loading.value || (isPending.value && localQuestions.value.length === 0),
    (busy) => {
      if (busy) {
        startMessages()
      } else {
        stopMessages()
      }
    }
  )

  // Poll while pending
  const { pause: pausePoll, resume: resumePoll } = useIntervalFn(
    async () => {
      if (isOpen.value && isPending.value) {
        await fetchToday(true) // silent fetch
      }
    },
    3000,
    { immediate: false }
  )

  watch(isPending, (pending) => {
    if (pending) resumePoll()
    else pausePoll()
  })

  // Show manual refresh if taking too long (15s)
  let refreshTimer: NodeJS.Timeout | null = null
  watch(
    () => loading.value || isPending.value,
    (busy) => {
      if (busy) {
        showManualRefresh.value = false
        if (refreshTimer) clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
          showManualRefresh.value = true
        }, 15000)
      } else {
        showManualRefresh.value = false
        if (refreshTimer) clearTimeout(refreshTimer)
      }
    }
  )

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted, onTaskFailed } = useUserRunsState()

  // Listeners
  onTaskCompleted('generate-daily-checkin', async (run) => {
    // Refresh checkin data
    await fetchToday()
    if (checkin.value?.status === 'COMPLETED') {
      localQuestions.value = checkin.value.questions || []
      userNotes.value = checkin.value.userNotes || ''
      useCheckinStore().currentCheckin = checkin.value
    } else if (checkin.value?.status === 'FAILED') {
      error.value = tr('daily_checkin_generation_failed', 'Generation failed')
    }
  })

  onTaskFailed('generate-daily-checkin', async (run) => {
    loading.value = false
    error.value = run.error?.message || tr('daily_checkin_generation_failed', 'Generation failed')
    if (checkin.value) {
      checkin.value = { ...checkin.value, status: 'FAILED' }
    }
    toast.add({
      title: tr('daily_checkin_failed_toast', 'Check-in Failed'),
      description: error.value ?? undefined,
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  })

  async function fetchToday(silent = false) {
    if (import.meta.server) return
    try {
      if (!silent) loading.value = true
      error.value = null
      const data = (await ($fetch as any)('/api/checkin/today')) as any
      if (data) {
        const changedCheckin = checkin.value?.id !== data.id
        checkin.value = data
        if (changedCheckin) answers.value = {}

        // Populate questions if available (stale-while-revalidate)
        if (data.questions && data.questions.length > 0) {
          localQuestions.value = data.questions
        }

        if (data.status === 'COMPLETED') {
          // Update reliable data
          localQuestions.value = data.questions || []
          userNotes.value = data.userNotes || ''
          // Pre-fill answers if they exist
          data.questions.forEach((q: any) => {
            if (q.answer) answers.value[q.id] = q.answer
          })
          if (!silent || changedCheckin) moveToFirstUnanswered()
        }
      } else if (!silent) {
        // Generate if not found
        await generate(false)
      }
    } catch (e: any) {
      error.value = e?.data?.message || e?.message || 'Failed to load check-in'
    } finally {
      if (!silent) loading.value = false
    }
  }

  async function fetchHistory() {
    try {
      recentCheckins.value =
        ((await ($fetch as any)('/api/checkin/history', {
          query: { limit: 14 }
        })) as any[]) || []
    } catch (error) {
      recentCheckins.value = []
    }
  }

  async function generate(force: boolean = false) {
    try {
      loading.value = true
      error.value = null
      const data = (await ($fetch as any)('/api/checkin/generate', {
        method: 'POST',
        body: { force }
      })) as any
      checkin.value = data

      if (force) answers.value = {}
      if (data.status === 'COMPLETED') {
        localQuestions.value = data.questions || []
      } else {
        // If pending/processing, clear questions ONLY if force was true
        // Otherwise keep old ones if they exist
        if (force) {
          localQuestions.value = []
          answers.value = {}
        }
      }
      userNotes.value = ''
      questionIndex.value = 0
      submitError.value = null

      refreshRuns()
    } catch (e: any) {
      error.value = e?.data?.message || e?.message || 'Failed to generate check-in'
    } finally {
      loading.value = false
    }
  }

  async function submit() {
    if (!checkin.value) return
    try {
      submitting.value = true
      submitError.value = null
      // Only send answers for remaining questions
      const filteredAnswers: Record<string, string> = {}
      localQuestions.value.forEach((q) => {
        const answer = answers.value[q.id]
        if (answer) {
          filteredAnswers[q.id] = answer
        }
      })

      await ($fetch as any)('/api/checkin/answer', {
        method: 'POST',
        body: {
          checkinId: checkin.value.id,
          answers: filteredAnswers,
          userNotes: userNotes.value
        }
      })
      await useCheckinStore().fetchToday()
      await fetchHistory()
      trackDailyCheckinComplete()
      emit('update:open', false)
      // Maybe toast success?
    } catch (e: any) {
      submitError.value =
        e?.data?.message ||
        e?.message ||
        tr(
          'journey_checkin_save_error',
          'Your check-in could not be saved. Your answers are still here; try again.'
        )
    } finally {
      submitting.value = false
    }
  }

  watch(
    () => props.open,
    (isOpen) => {
      if (isOpen) {
        trackDailyCheckinStart()
        submitError.value = null
        if (isPending.value) resumePoll()
        fetchToday()
        fetchHistory()
      } else {
        pausePoll()
        stopMessages()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    pausePoll()
    stopMessages()
    if (refreshTimer) clearTimeout(refreshTimer)
  })

  function summarizeCheckin(entry: any) {
    const questions = entry?.questions || []
    return questions
      .filter((question: any) => question.answer)
      .map((question: any) => `${question.text}: ${question.answer}`)
  }

  function loadCheckinIntoEditor(entry: any) {
    checkin.value = entry
    localQuestions.value = entry.questions || []
    userNotes.value = entry.userNotes || ''
    answers.value = {}
    for (const question of entry.questions || []) {
      if (question.answer) {
        answers.value[question.id] = question.answer
      }
    }
    moveToFirstUnanswered()
    submitError.value = null
  }

  async function deleteCheckin() {
    if (!checkin.value?.id) return
    if (!window.confirm(tr('daily_checkin_delete_confirm', 'Delete this daily check-in?'))) return

    deleting.value = true
    try {
      await ($fetch as any)(`/api/checkin/${checkin.value.id}`, {
        method: 'DELETE'
      })
      checkin.value = null
      localQuestions.value = []
      answers.value = {}
      userNotes.value = ''
      await Promise.all([useCheckinStore().fetchToday(), fetchHistory()])
      toast.add({
        title: tr('daily_checkin_deleted_toast', 'Daily check-in deleted'),
        color: 'success'
      })
    } catch (error: any) {
      toast.add({
        title: tr('daily_checkin_delete_failed_toast', 'Unable to delete check-in'),
        description: error?.data?.message || error?.message || 'Please try again.',
        color: 'error'
      })
    } finally {
      deleting.value = false
    }
  }
</script>

<style scoped>
  .checkin-journey__question {
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 1.45;
    letter-spacing: -0.02em;
  }
  .checkin-journey__question:focus {
    outline: none;
  }
  .checkin-journey__disclosure {
    border-top: 1px solid var(--ui-border);
  }
  .checkin-journey__disclosure summary {
    padding-block: 1rem;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--ui-text-muted);
  }
  .checkin-journey__disclosure summary:focus-visible,
  .checkin-journey__disclosure button:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 3px;
  }
</style>
