<template>
  <div
    v-if="notice"
    role="status"
    class="flex flex-col gap-2 border-y px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:rounded-xl sm:border"
    :class="toneClass"
    :data-testid="`today-notice-${notice.key}`"
  >
    <div class="flex min-w-0 flex-1 items-start gap-3">
      <UIcon
        :name="notice.icon"
        class="mt-0.5 size-5 shrink-0"
        :class="[iconClass, notice.spin ? 'animate-spin' : '']"
      />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-highlighted">{{ notice.title }}</p>
        <p v-if="notice.description" class="line-clamp-2 text-sm text-muted">
          {{ notice.description }}
        </p>
      </div>
      <UButton
        v-if="notice.onDismiss"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-heroicons-x-mark"
        class="-me-2 -mt-1 shrink-0 sm:hidden"
        :aria-label="t('today_notice_dismiss')"
        @click="notice.onDismiss"
      />
    </div>
    <div
      v-if="notice.actions.length || notice.onDismiss"
      class="flex shrink-0 items-center gap-2 ps-8 sm:ps-0"
    >
      <UButton
        v-for="action in notice.actions"
        :key="action.label"
        :to="action.to"
        :color="action.primary ? notice.buttonColor : 'neutral'"
        :variant="action.primary ? 'solid' : 'outline'"
        size="sm"
        @click="action.onClick?.()"
      >
        {{ action.label }}
      </UButton>
      <UButton
        v-if="notice.onDismiss"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-heroicons-x-mark"
        class="hidden sm:inline-flex"
        :aria-label="t('today_notice_dismiss')"
        @click="notice.onDismiss"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import type { OnboardingStatus } from '#shared/onboarding-status'
  import { resolveMissingFieldGuides } from '~/utils/missing-profile-fields'

  /**
   * One compact notice slot for the Today screen. At most one notice shows at
   * a time, in priority order: setup incomplete > missing critical profile
   * data > trial ending soon.
   */
  const props = defineProps<{
    setupStatus: OnboardingStatus | null
    showSetup: boolean
    missingFields: string[]
    trialEndingSoon: boolean
    trialEndsAt: string | Date | null
    trialEndsAtLabel: string
  }>()

  const emit = defineEmits<{
    sync: []
    'complete-setup': []
  }>()

  const { t } = useTranslate('dashboard')
  const { t: tOnboarding } = useTranslate('onboarding')
  const { t: tProfile } = useTranslate('profile')
  const { trackWidgetClick } = useAnalytics()

  const PROFILE_DISMISS_KEY = 'profile-banner-dismissed'
  const TRIAL_DISMISS_KEY = 'today-trial-notice-dismissed'

  const profileDismissed = ref(false)
  const trialDismissedFor = ref<string | null>(null)

  function readStorage(key: string) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  function writeStorage(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Storage can be unavailable (private mode); dismissal then lasts for this view only.
    }
  }

  onMounted(() => {
    profileDismissed.value = !!readStorage(PROFILE_DISMISS_KEY)
    trialDismissedFor.value = readStorage(TRIAL_DISMISS_KEY)
  })

  type Tone = 'primary' | 'warning' | 'error'

  interface NoticeAction {
    label: string
    to?: string
    primary?: boolean
    onClick?: () => void
  }

  interface Notice {
    key: 'setup' | 'profile' | 'trial'
    tone: Tone
    buttonColor: Tone
    icon: string
    spin?: boolean
    title: string
    description?: string
    actions: NoticeAction[]
    onDismiss?: () => void
  }

  const setupNotice = computed<Notice | null>(() => {
    const status = props.setupStatus
    if (!props.showSetup || !status) return null
    const ot = tOnboarding.value

    let title = ot('setup_progress_connect_title')
    let description = ot('setup_progress_connect_desc')
    if (status.importState === 'importing') {
      title = ot('setup_progress_importing_title')
      description = ot('setup_progress_importing_desc')
    } else if (status.importState === 'failed') {
      title = ot('setup_progress_failed_title')
      description = status.importErrorMessage || ot('setup_progress_failed_desc')
    } else if (status.importState === 'empty') {
      title = ot('setup_progress_empty_title')
      description = ot('setup_progress_empty_desc')
    } else if (status.hasFirstInsight) {
      title = ot('setup_progress_insight_ready_title')
      description = ot('setup_progress_insight_ready_desc')
    } else if (status.hasUsableData) {
      title = ot('setup_progress_analysis_title')
      description = ot('setup_progress_analysis_desc')
    } else if (status.hasIntegration) {
      title = ot('setup_progress_connected_title')
      description = ot('setup_progress_connected_desc')
    }

    const actions: NoticeAction[] = []
    if (status.importState === 'failed') {
      actions.push({
        label: ot('setup_progress_retry_sync'),
        primary: true,
        onClick: () => emit('sync')
      })
    }
    if (status.hasFirstInsight && !status.activationComplete) {
      actions.push({
        label: ot('setup_progress_view_insight'),
        primary: true,
        onClick: () => emit('complete-setup')
      })
    }
    if (!status.hasIntegration) {
      actions.push({ label: ot('setup_progress_connect_apps'), to: '/settings/apps' })
    }

    const failed = status.importState === 'failed'
    return {
      key: 'setup',
      tone: failed ? 'error' : 'primary',
      buttonColor: failed ? 'error' : 'primary',
      icon: failed
        ? 'i-heroicons-exclamation-triangle'
        : status.importState === 'importing'
          ? 'i-heroicons-arrow-path'
          : 'i-heroicons-sparkles',
      spin: status.importState === 'importing',
      title,
      description,
      actions,
      onDismiss: status.activationComplete
        ? undefined
        : () => {
            trackWidgetClick('today_notice', 'dismiss_setup')
            emit('complete-setup')
          }
    }
  })

  const missingFieldNames = computed(() => {
    const guides = new Map(
      resolveMissingFieldGuides(props.missingFields).map(({ field, guide }) => [
        field,
        guide.titleKey
      ])
    )
    return props.missingFields.map((field) => {
      const key = guides.get(field)
      return key ? tProfile.value(key) : field
    })
  })

  const profileNotice = computed<Notice | null>(() => {
    if (profileDismissed.value || props.missingFields.length === 0) return null
    return {
      key: 'profile',
      tone: 'warning',
      buttonColor: 'warning',
      icon: 'i-heroicons-user-circle',
      title: t.value('today_notice_profile_title'),
      description: t.value('today_notice_profile_desc', {
        fields: missingFieldNames.value.join(', ')
      }),
      actions: [
        {
          label: t.value('today_notice_profile_action'),
          to: '/profile/settings?complete=1',
          primary: true,
          onClick: () => trackWidgetClick('today_notice', 'complete_profile')
        }
      ],
      onDismiss: () => {
        profileDismissed.value = true
        writeStorage(PROFILE_DISMISS_KEY, 'true')
      }
    }
  })

  const trialKey = computed(() =>
    props.trialEndsAt ? new Date(props.trialEndsAt).toISOString() : null
  )

  const trialNotice = computed<Notice | null>(() => {
    if (!props.trialEndingSoon) return null
    if (trialKey.value && trialDismissedFor.value === trialKey.value) return null
    return {
      key: 'trial',
      tone: 'warning',
      buttonColor: 'warning',
      icon: 'i-heroicons-clock',
      title: t.value('today_notice_trial_title', { date: props.trialEndsAtLabel }),
      description: t.value('today_notice_trial_desc'),
      actions: [
        {
          label: t.value('today_notice_trial_action'),
          to: '/settings/billing',
          primary: true,
          onClick: () => trackWidgetClick('today_notice', 'trial_upgrade')
        }
      ],
      onDismiss: () => {
        trialDismissedFor.value = trialKey.value
        if (trialKey.value) writeStorage(TRIAL_DISMISS_KEY, trialKey.value)
      }
    }
  })

  const notice = computed(() => setupNotice.value || profileNotice.value || trialNotice.value)

  const toneClass = computed(() => {
    switch (notice.value?.tone) {
      case 'error':
        return 'border-error/30 bg-error/5'
      case 'warning':
        return 'border-warning/30 bg-warning/5'
      default:
        return 'border-primary/25 bg-primary/5'
    }
  })

  const iconClass = computed(() => {
    switch (notice.value?.tone) {
      case 'error':
        return 'text-error'
      case 'warning':
        return 'text-warning'
      default:
        return 'text-primary'
    }
  })
</script>
