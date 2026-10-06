<template>
  <div
    class="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-x-clip bg-[#152523] px-4 py-10 sm:px-6 lg:py-16"
  >
    <UContainer class="relative z-10 w-full max-w-lg">
      <div class="grid overflow-hidden rounded-2xl border border-white/10 bg-[#1b2d2a]">
        <div class="relative flex flex-col justify-center p-6 sm:p-10">
          <div class="relative z-10 mx-auto w-full max-w-md">
            <h1 class="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              {{ t('login.heading') }}
              <span class="text-primary-400">{{ t('login.heading_accent') }}</span>
            </h1>
            <p class="mt-4 text-base font-medium text-gray-400 sm:text-lg">
              {{ t('login.form_subtitle') }}
            </p>

            <div class="mt-8 space-y-3">
              <UButton
                v-if="appleSignInEnabled"
                block
                size="xl"
                icon="i-simple-icons-apple"
                color="neutral"
                variant="solid"
                class="h-14 min-w-full rounded-xl bg-black text-sm font-medium text-white hover:bg-neutral-900"
                :loading="loadingApple || isInitializing"
                @click="
                  () => {
                    void handleAppleLogin()
                  }
                "
              >
                {{ isInitializing ? t('login.connecting') : t('login.apple') }}
              </UButton>

              <UButton
                block
                size="xl"
                icon="i-simple-icons-google"
                color="primary"
                variant="solid"
                class="h-14 min-w-full rounded-xl text-sm font-medium"
                :loading="loading || isInitializing"
                @click="
                  () => {
                    void handleGoogleLogin()
                  }
                "
              >
                {{ isInitializing ? t('login.connecting') : t('login.google') }}
              </UButton>

              <details class="auth-more-options">
                <summary>{{ moreSignInOptions }}</summary>
                <UButton
                  block
                  size="xl"
                  color="neutral"
                  variant="outline"
                  class="h-14 min-w-full rounded-xl border-white/10 text-sm font-medium"
                  :loading="loadingStrava || isInitializing"
                  @click="
                    () => {
                      void handleStravaLogin()
                    }
                  "
                >
                  <template #leading>
                    <UIcon name="i-simple-icons-strava" class="h-5 w-5 text-[#FC4C02]" />
                  </template>
                  {{ isInitializing ? t('login.connecting') : t('login.strava') }}
                </UButton>

                <UButton
                  block
                  size="xl"
                  color="neutral"
                  variant="outline"
                  class="h-14 min-w-full rounded-xl border-white/10 text-sm font-medium"
                  :loading="loadingIntervals || isInitializing"
                  @click="
                    () => {
                      void handleIntervalsLogin()
                    }
                  "
                >
                  <template #leading>
                    <img src="/images/logos/intervals.png" alt="" class="h-5 w-5" />
                  </template>
                  {{ isInitializing ? t('login.connecting') : t('login.intervals') }}
                </UButton>
              </details>
            </div>

            <p class="mt-8 text-sm text-gray-400">
              {{ t('login.new_athlete') }}
              <NuxtLink
                :to="
                  callbackUrl === '/dashboard'
                    ? '/join'
                    : `/join?callbackUrl=${encodeURIComponent(callbackUrl)}`
                "
                class="ml-1 font-medium text-primary-300 transition-colors hover:text-primary-300"
                >{{ t('login.create_account') }}</NuxtLink
              >
            </p>

            <p class="mt-4 max-w-sm text-xs leading-relaxed text-gray-400">
              {{ t('login.terms_agree') }}
              <NuxtLink to="/terms" class="underline underline-offset-2 hover:text-white">{{
                t('login.terms')
              }}</NuxtLink>
              {{ t('login.and') }}
              <NuxtLink to="/privacy" class="underline underline-offset-2 hover:text-white">{{
                t('login.privacy')
              }}</NuxtLink
              >.
            </p>
          </div>

          <div
            v-if="isInitializing"
            class="absolute inset-0 z-50 flex items-center justify-center bg-[#152523]/90"
          >
            <div class="text-center">
              <UIcon
                name="i-heroicons-arrow-path"
                class="mx-auto h-8 w-8 animate-spin text-primary-400"
              />
              <p class="mt-4 text-lg font-medium text-white">
                {{ t('login.signing_in') }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'

  const { t } = useTranslate('auth')
  const moreSignInOptions = computed(() => {
    const value = t.value('login.more_options')
    return value === 'login.more_options' ? 'More sign-in options' : value
  })
  const { signIn } = useAuth()
  const route = useRoute()
  const toast = useToast()
  const { trackLogin } = useAnalytics()
  const runtimeConfig = useRuntimeConfig()
  const appleSignInEnabled = computed(() => Boolean(runtimeConfig.public.appleSignInEnabled))

  definePageMeta({
    layout: 'home',
    middleware: ['guest'],
    auth: false
  })

  const callbackUrl = (route.query.callbackUrl as string) || '/dashboard'

  useSeoMeta({
    title: () => t.value('login.seo_title'),
    ogTitle: () => t.value('login.seo_og_title'),
    description: () => t.value('login.seo_description'),
    ogDescription: () => t.value('login.seo_description'),
    ogImage: '/images/og-image.png',
    twitterCard: 'summary_large_image',
    twitterTitle: () => t.value('login.seo_og_title'),
    twitterDescription: () => t.value('login.seo_description'),
    twitterImage: '/images/og-image.png'
  })

  const loading = ref(false)
  const loadingApple = ref(false)
  const loadingStrava = ref(false)
  const loadingIntervals = ref(false)
  const isInitializing = ref(false)

  async function handleAppleLogin() {
    trackLogin('apple')
    isInitializing.value = true
    loadingApple.value = true
    try {
      await signIn('apple', { callbackUrl })
    } catch (error: any) {
      toast.add({
        title: t.value('login.error_title'),
        description: error.message || t.value('login.error_apple'),
        color: 'error'
      })
      isInitializing.value = false
      loadingApple.value = false
    }
  }

  async function handleGoogleLogin() {
    trackLogin('google')
    isInitializing.value = true
    loading.value = true
    try {
      await signIn('google', { callbackUrl })
    } catch (error: any) {
      toast.add({
        title: t.value('login.error_title'),
        description: error.message || t.value('login.error_google'),
        color: 'error'
      })
      isInitializing.value = false
      loading.value = false
    }
  }

  async function handleStravaLogin() {
    trackLogin('strava')
    isInitializing.value = true
    loadingStrava.value = true
    try {
      await signIn('strava', { callbackUrl })
    } catch (error: any) {
      toast.add({
        title: t.value('login.error_title'),
        description: error.message || t.value('login.error_strava'),
        color: 'error'
      })
      isInitializing.value = false
      loadingStrava.value = false
    }
  }

  async function handleIntervalsLogin() {
    trackLogin('intervals')
    isInitializing.value = true
    loadingIntervals.value = true
    try {
      await signIn('intervals', { callbackUrl })
    } catch (error: any) {
      toast.add({
        title: t.value('login.error_title'),
        description: error.message || t.value('login.error_intervals'),
        color: 'error'
      })
      isInitializing.value = false
      loadingIntervals.value = false
    }
  }
</script>

<style scoped>
  .auth-more-options {
    border-top: 1px solid #354e47;
    padding-top: 0.75rem;
  }
  .auth-more-options summary {
    color: #a7bbb5;
    cursor: pointer;
    font-size: 0.875rem;
    min-height: 2.75rem;
    padding: 0.5rem 0;
  }
  .auth-more-options summary:focus-visible {
    outline: 2px solid #93c9bc;
    outline-offset: 4px;
  }
  .auth-more-options :deep(button) {
    margin-top: 0.75rem;
  }
</style>
