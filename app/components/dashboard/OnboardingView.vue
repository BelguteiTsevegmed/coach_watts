<template>
  <section v-if="status" class="setup-journey">
    <p class="text-sm text-muted">{{ td('journey_setup_welcome') }}</p>
    <h1 class="setup-journey__title">{{ heroTitle }}</h1>
    <p class="setup-journey__description">{{ heroDescription }}</p>

    <div class="mt-8 flex flex-wrap items-center gap-4">
      <UButton v-if="nextRoute" :to="nextRoute" size="lg">{{ actionLabel }}</UButton>
      <UButton v-else size="lg" @click="emit('connect-later')">{{ actionLabel }}</UButton>
      <UButton
        v-if="setupStep !== 'consent' && setupStep !== 'ready'"
        color="neutral"
        variant="link"
        @click="emit('connect-later')"
      >
        {{ td('journey_setup_later') }}
      </UButton>
    </div>

    <div class="setup-journey__path" aria-label="Your training journey">
      <span :class="{ 'text-primary': status.hasPrimaryGoal }">{{
        td('journey_setup_goal_step')
      }}</span>
      <span class="setup-journey__line" aria-hidden="true" />
      <span :class="{ 'text-primary': status.hasActivePlan }">{{
        td('journey_setup_plan_step')
      }}</span>
      <span class="setup-journey__line" aria-hidden="true" />
      <span>{{ td('journey_setup_today_step') }}</span>
    </div>

    <section v-if="showImportPanel" class="setup-journey__import" aria-live="polite">
      <h2 class="font-medium">{{ importPanelTitle }}</h2>
      <p class="mt-2 text-sm text-muted leading-relaxed">{{ importPanelDescription }}</p>
      <UButton
        v-if="status.importState === 'failed'"
        class="mt-4"
        color="neutral"
        variant="outline"
        @click="emit('sync')"
      >
        {{ t('setup_progress_retry_sync') }}
      </UButton>
    </section>

    <details v-if="setupStep !== 'consent'" class="setup-journey__disclosure">
      <summary>{{ td('journey_setup_import_optional') }}</summary>
      <div class="pb-7">
        <p class="text-sm text-muted leading-relaxed mb-5">
          {{ td('journey_setup_import_description') }}
        </p>
        <div
          v-if="!status.hasIntegration"
          class="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-default"
        >
          <div class="flex items-center gap-3">
            <img
              :src="primaryProviderLogo"
              :alt="primaryProviderLabel"
              class="size-7 object-contain"
            />
            <span class="font-medium text-sm">{{ primaryProviderLabel }}</span>
          </div>
          <UButton
            color="neutral"
            variant="outline"
            :disabled="status.primaryProvider === 'strava' && isStravaDisabled"
            @click="connectPrimaryProvider"
          >
            {{ td('journey_setup_connect_provider', { provider: primaryProviderLabel }) }}
          </UButton>
        </div>
        <details class="mt-4">
          <summary class="text-sm cursor-pointer text-muted py-2">
            {{ td('journey_setup_other_apps') }}
          </summary>
          <div
            v-for="provider in secondaryProviders"
            :key="provider.id"
            class="flex items-center justify-between gap-4 py-4 border-b border-default"
          >
            <div class="min-w-0">
              <p class="font-medium text-sm">{{ provider.label }}</p>
              <p v-if="provider.disabledReason" class="mt-1 text-xs text-muted">
                {{ provider.disabledReason }}
              </p>
            </div>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="provider.disabled"
              @click="connectSecondaryProvider(provider)"
            >
              {{ t('connect_button') }}
            </UButton>
          </div>
        </details>
        <UButton to="/workouts/upload" color="neutral" variant="link" class="mt-5">{{
          td('journey_setup_upload')
        }}</UButton>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import type { OnboardingStatus } from '#shared/onboarding-status'

  const props = defineProps<{
    status: OnboardingStatus
  }>()

  const emit = defineEmits<{
    sync: []
    'connect-later': []
  }>()

  const { t } = useTranslate('onboarding')
  const { t: td } = useTranslate('dashboard')
  const { signIn } = useAuth()
  const { trackSetupHubViewed, trackIntegrationConnectStart } = useAnalytics()

  onMounted(() => {
    trackSetupHubViewed({
      currentStep: props.status.currentStep,
      resume: props.status.hasIntegration || props.status.hasAnyData,
      signupMethod: props.status.signupMethod
    })
  })

  const showImportPanel = computed(
    () =>
      props.status.hasIntegration &&
      (props.status.importState === 'importing' ||
        props.status.importState === 'failed' ||
        props.status.importState === 'empty' ||
        (props.status.signupMethod !== 'google' && !props.status.hasUsableData))
  )

  const setupStep = computed(() => {
    if (props.status.hasConsent === false) return 'consent'
    if (!props.status.hasPrimaryGoal) return 'goal'
    if (!props.status.hasActivePlan) return 'plan'
    return 'ready'
  })
  const heroTitle = computed(() => td.value(`journey_setup_${setupStep.value}_title`))
  const heroDescription = computed(() => td.value(`journey_setup_${setupStep.value}_description`))
  const nextRoute = computed(() => {
    if (setupStep.value === 'consent') return '/onboarding'
    if (setupStep.value === 'goal') return '/profile/goals?new=1&returnTo=/dashboard'
    if (setupStep.value === 'plan') return '/plan?returnTo=/dashboard'
    return undefined
  })
  const actionLabel = computed(() => td.value(`journey_setup_${setupStep.value}_action`))

  const importPanelTitle = computed(() => {
    if (props.status.importState === 'failed') return t.value('setup_progress_failed_title')
    if (props.status.importState === 'empty') return t.value('setup_progress_empty_title')
    return t.value('setup_progress_importing_title')
  })

  const importPanelDescription = computed(() => {
    if (props.status.importErrorMessage) return props.status.importErrorMessage
    if (props.status.importState === 'empty') return t.value('setup_progress_empty_desc')
    if (props.status.importState === 'failed') return t.value('setup_progress_failed_desc')
    return t.value('setup_progress_importing_desc')
  })

  const primaryProviderLabel = computed(() =>
    props.status.primaryProvider === 'strava' ? 'Strava' : 'Intervals.icu'
  )

  const primaryProviderLogo = computed(() =>
    props.status.primaryProvider === 'strava'
      ? '/images/logos/strava.svg'
      : '/images/logos/intervals.png'
  )

  type SecondaryProvider = {
    id: string
    label: string
    descriptionKey: string
    logo?: string
    color: 'warning' | 'error' | 'success' | 'neutral' | 'primary'
    path?: string
    oauth?: 'intervals' | 'strava'
    disabled?: boolean
    disabledReason?: string
    disabledLabel?: string
  }

  const isStravaDisabled = computed(() => {
    const config = useRuntimeConfig()
    return config.public.stravaEnabled === false
  })

  const isWhoopDisabled = computed(() => {
    const hostname = import.meta.client ? window.location.hostname : useRequestURL().hostname
    return hostname === 'coachwatts.com' || hostname === 'www.coachwatts.com'
  })

  const secondaryProviders = computed<SecondaryProvider[]>(() => {
    const primary = props.status.primaryProvider
    const providers: SecondaryProvider[] = [
      {
        id: 'strava',
        label: 'Strava',
        descriptionKey: 'strava_description',
        logo: '/images/logos/strava.svg',
        color: 'warning',
        path: '/connect-strava',
        disabled: isStravaDisabled.value,
        disabledReason: isStravaDisabled.value ? t.value('strava_disabled') : undefined,
        disabledLabel: t.value('strava_disabled')
      },
      {
        id: 'whoop',
        label: 'WHOOP',
        descriptionKey: 'whoop_description',
        logo: '/images/logos/whoop_square.svg',
        color: 'error',
        path: '/connect-whoop',
        disabled: isWhoopDisabled.value,
        disabledReason: isWhoopDisabled.value ? t.value('whoop_disabled') : undefined,
        disabledLabel: t.value('whoop_temp_unavailable')
      },
      {
        id: 'yazio',
        label: 'Yazio',
        descriptionKey: 'yazio_description',
        logo: '/images/logos/yazio_square.webp',
        color: 'success',
        path: '/connect-yazio'
      },
      {
        id: 'fitbit',
        label: 'Fitbit',
        descriptionKey: 'fitbit_description',
        color: 'success',
        path: '/connect-fitbit'
      },
      {
        id: 'wahoo',
        label: 'Wahoo',
        descriptionKey: 'wahoo_description',
        logo: '/images/logos/wahoo_logo_square.jpeg',
        color: 'neutral',
        path: '/connect-wahoo'
      }
    ]

    if (primary !== 'intervals') {
      providers.unshift({
        id: 'intervals',
        label: 'Intervals.icu',
        descriptionKey: 'intervals_description',
        logo: '/images/logos/intervals.png',
        color: 'primary',
        oauth: 'intervals'
      })
    }

    return providers.filter((provider) => provider.id !== primary)
  })

  function connectFromSetupHub(provider: string, connect: () => unknown) {
    trackIntegrationConnectStart(provider, { surface: 'setup_hub' })
    void connect()
  }

  function connectPrimaryProvider() {
    const provider = props.status.primaryProvider ?? 'intervals'
    if (provider === 'strava') {
      if (isStravaDisabled.value) return
      connectFromSetupHub('strava', () => navigateTo('/connect-strava'))
      return
    }
    connectFromSetupHub('intervals', () => signIn('intervals'))
  }

  function connectSecondaryProvider(provider: SecondaryProvider) {
    if (provider.disabled) return
    if (provider.oauth === 'intervals') {
      connectFromSetupHub('intervals', () => signIn('intervals'))
      return
    }
    if (provider.path) {
      connectFromSetupHub(provider.id, () => navigateTo(provider.path!))
    }
  }
</script>

<style scoped>
  .setup-journey {
    padding-block: 1.5rem 2rem;
  }
  .setup-journey__title {
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: -0.04em;
    max-width: 20ch;
    margin-top: 1.25rem;
  }
  .setup-journey__description {
    max-width: 56ch;
    margin-top: 1.25rem;
    line-height: 1.75;
    color: var(--ui-text-muted);
  }
  .setup-journey__path {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.8rem;
    color: var(--ui-text-muted);
    margin-block: 3.5rem 2.5rem;
  }
  .setup-journey__line {
    height: 1px;
    width: 2rem;
    background: var(--ui-border);
  }
  .setup-journey__import {
    border-left: 2px solid var(--ui-primary);
    padding-left: 1.25rem;
    margin-block: 2rem;
  }
  .setup-journey__disclosure {
    border-top: 1px solid var(--ui-border);
  }
  .setup-journey__disclosure summary {
    padding-block: 1.25rem;
    cursor: pointer;
    font-size: 0.9rem;
  }
  summary:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 4px;
  }
</style>
