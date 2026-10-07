<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-none sm:shadow-sm p-5 sm:p-8 border-x-0 sm:border-x border-y border-gray-200 dark:border-white/5"
    data-testid="workout-coach-take"
  >
    <!-- Header -->
    <div class="flex items-start justify-between gap-4 mb-5">
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-primary-500/10 border border-primary-500/20"
        >
          <UIcon
            name="i-heroicons-chat-bubble-bottom-center-text"
            class="w-5 h-5 text-primary-500"
          />
        </div>
        <div class="min-w-0">
          <h2 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            {{ t('coach_take_title') }}
          </h2>
          <p v-if="hasAnalysis && analyzedAtLabel" class="text-xs text-gray-500 dark:text-gray-400">
            {{ t('coach_take_reviewed_at', { date: analyzedAtLabel }) }}
          </p>
        </div>
      </div>

      <div v-if="hasAnalysis" class="flex items-center gap-2 shrink-0">
        <UButton
          v-if="canPublish"
          icon="i-heroicons-paper-airplane"
          color="neutral"
          variant="outline"
          size="sm"
          class="hidden sm:flex"
          :loading="publishing"
          :disabled="publishing || analyzing"
          @click="
            () => {
              emit('publish')
            }
          "
        >
          {{ t('analysis_button_publish') }}
        </UButton>
        <UTooltip :text="t('coach_take_refresh_hint')">
          <UButton
            icon="i-heroicons-arrow-path"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('coach_take_refresh')"
            :loading="analyzing"
            :disabled="analyzing"
            @click="
              () => {
                emit('analyze')
              }
            "
          />
        </UTooltip>
      </div>
    </div>

    <!-- Structured analysis -->
    <div v-if="analysisJson" class="space-y-6">
      <p
        v-if="analysisJson.executive_summary"
        class="text-base sm:text-lg text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap"
      >
        {{ analysisJson.executive_summary }}
      </p>

      <!-- Recommendations: what to do next time -->
      <div v-if="analysisJson.recommendations?.length" class="space-y-3">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
          {{ t('coach_take_next_time') }}
        </h3>
        <ul class="space-y-3">
          <li
            v-for="(rec, index) in analysisJson.recommendations"
            :key="index"
            class="border-l-4 pl-4 py-0.5"
            :class="getPriorityBorderClass(rec.priority)"
          >
            <div class="font-medium text-gray-900 dark:text-white">{{ rec.title }}</div>
            <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
              {{ rec.description }}
            </p>
          </li>
        </ul>
      </div>

      <div v-if="hasBreakdown">
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          class="px-0"
          :trailing-icon="showBreakdown ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
          @click="
            () => {
              showBreakdown = !showBreakdown
            }
          "
        >
          {{ showBreakdown ? t('coach_take_hide_breakdown') : t('coach_take_show_breakdown') }}
        </UButton>

        <div v-if="showBreakdown" class="mt-4 space-y-6">
          <!-- Strengths & things to work on -->
          <div
            v-if="analysisJson.strengths?.length || analysisJson.weaknesses?.length"
            class="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div
              v-if="analysisJson.strengths?.length"
              class="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/5"
            >
              <h3 class="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-3">
                {{ t('coach_take_went_well') }}
              </h3>
              <ul class="space-y-2">
                <li
                  v-for="(strength, index) in analysisJson.strengths"
                  :key="index"
                  class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200"
                >
                  <UIcon
                    name="i-heroicons-check-circle"
                    class="w-4 h-4 mt-0.5 text-emerald-500 shrink-0"
                  />
                  <span>{{ strength }}</span>
                </li>
              </ul>
            </div>
            <div
              v-if="analysisJson.weaknesses?.length"
              class="rounded-xl p-4 border border-amber-500/20 bg-amber-500/5"
            >
              <h3 class="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-3">
                {{ t('coach_take_work_on') }}
              </h3>
              <ul class="space-y-2">
                <li
                  v-for="(weakness, index) in analysisJson.weaknesses"
                  :key="index"
                  class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200"
                >
                  <UIcon
                    name="i-heroicons-arrow-trending-up"
                    class="w-4 h-4 mt-0.5 text-amber-500 shrink-0"
                  />
                  <span>{{ weakness }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Detailed sections -->
          <div v-if="analysisJson.sections?.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="(section, index) in analysisJson.sections"
              :key="index"
              class="rounded-xl border border-gray-200 dark:border-white/5 overflow-hidden"
            >
              <div
                class="px-4 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between gap-3 bg-gray-50 dark:bg-white/[0.02]"
              >
                <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {{ section.title }}
                </h3>
                <span
                  v-if="section.status_label || section.status"
                  class="px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide shrink-0"
                  :class="getStatusPillClass(section.status)"
                >
                  {{ section.status_label || section.status }}
                </span>
              </div>
              <ul class="px-4 py-3 space-y-2">
                <li
                  v-for="(point, pIndex) in section.analysis_points"
                  :key="pIndex"
                  class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                >
                  <UIcon
                    name="i-heroicons-chevron-right"
                    class="w-4 h-4 mt-0.5 text-primary-500/60 shrink-0"
                  />
                  <!-- eslint-disable-next-line vue/no-v-html -- numbers highlighted in AI text -->
                  <span v-html="highlightTechnicalData(point)"></span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Legacy markdown analysis -->
    <div v-else-if="workout?.aiAnalysis" class="prose prose-sm dark:prose-invert max-w-none">
      <!-- eslint-disable vue/no-v-html -- markdown-rendered analysis -->
      <div v-html="renderedAnalysis" />
      <!-- eslint-enable vue/no-v-html -->
    </div>

    <!-- In progress -->
    <div v-else-if="analyzing" class="flex items-center gap-3 py-6">
      <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-primary-500 animate-spin" />
      <p class="text-sm text-gray-600 dark:text-gray-300">{{ t('coach_take_analyzing') }}</p>
    </div>

    <!-- Not analysed yet: one clear action -->
    <div v-else class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <p class="text-sm text-gray-600 dark:text-gray-300 max-w-xl">
        {{ t('coach_take_empty_desc') }}
      </p>
      <UButton
        icon="i-heroicons-sparkles"
        color="primary"
        variant="solid"
        class="self-start sm:self-auto shrink-0"
        data-testid="workout-coach-take-cta"
        @click="
          () => {
            emit('analyze')
          }
        "
      >
        {{ t('coach_take_button') }}
      </UButton>
    </div>

    <!-- Rate this analysis -->
    <div
      v-if="hasAnalysis && workout?.llmUsageId"
      class="flex justify-end pt-4 mt-6 border-t border-gray-100 dark:border-white/5"
    >
      <AiFeedback
        :llm-usage-id="workout.llmUsageId"
        :initial-feedback="workout.feedback"
        :initial-feedback-text="workout.feedbackText"
        :hide-usage-link="!isAdmin"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { marked } from 'marked'
  import { getAnalysisStatusColor } from '~/utils/analysis-status'

  const props = defineProps<{
    workout: any
    analyzing?: boolean
    canPublish?: boolean
    publishing?: boolean
    isAdmin?: boolean
  }>()

  const emit = defineEmits<{
    analyze: []
    publish: []
  }>()

  const { t } = useTranslate('workout')
  const { formatDateTime } = useFormat()

  const showBreakdown = ref(false)

  const analysisJson = computed(() => props.workout?.aiAnalysisJson || null)
  const hasAnalysis = computed(() => Boolean(analysisJson.value || props.workout?.aiAnalysis))
  const hasBreakdown = computed(() =>
    Boolean(
      analysisJson.value?.sections?.length ||
      analysisJson.value?.strengths?.length ||
      analysisJson.value?.weaknesses?.length
    )
  )

  const analyzedAtLabel = computed(() =>
    props.workout?.aiAnalyzedAt ? formatDateTime(props.workout.aiAnalyzedAt) : ''
  )

  const renderedAnalysis = computed(() => {
    if (!props.workout?.aiAnalysis) return ''
    return marked(props.workout.aiAnalysis)
  })

  /**
   * Pill styling for an AI analysis section status. The severity decision itself
   * lives in `~/utils/analysis-status` so this card, the report page, the share
   * page and the score modal cannot disagree about it (CW-424).
   */
  function getStatusPillClass(status?: string | null) {
    switch (getAnalysisStatusColor(status)) {
      case 'success':
        return 'border-emerald-600/30 dark:border-[#00DC82]/30 text-emerald-700 dark:text-[#00DC82] bg-emerald-500/10 dark:bg-[#00DC82]/5'
      case 'warning':
        return 'border-amber-600/30 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/5'
      case 'error':
        return 'border-red-600/30 dark:border-red-500/30 text-red-700 dark:text-red-400 bg-red-500/10 dark:bg-red-500/5'
      case 'info':
        return 'border-blue-600/30 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/5'
      default:
        return 'border-zinc-500/30 dark:border-zinc-400/30 text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 dark:bg-zinc-500/5'
    }
  }

  function getPriorityBorderClass(priority?: string) {
    if (priority === 'high') return 'border-red-500'
    if (priority === 'medium') return 'border-amber-500'
    if (priority === 'low') return 'border-blue-500'
    return 'border-gray-300 dark:border-gray-700'
  }

  function escapeHtml(text: string) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /** Emphasise numbers-with-units inside the AI's bullet points. */
  function highlightTechnicalData(text: string): string {
    if (!text) return ''
    const technicalRegex =
      /(\b-?\d+(?:\.\d+)?\s*(?:VI|EF|IF|rpm|spm|min|sec|W|bpm|km|mi|m|kJ|kg|%|TSS|CTL|ATL|TSB)\b)/gi
    return escapeHtml(text).replace(
      technicalRegex,
      '<span class="font-semibold tabular-nums text-primary-700 dark:text-primary-400">$1</span>'
    )
  }
</script>
