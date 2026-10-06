<script setup lang="ts">
  const colorMode = useColorMode()

  const color = computed(() => (colorMode.value === 'dark' ? '#152523' : '#f6f9fa'))

  const { isOpen, options } = useUpgradeModal()

  useHead({
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { key: 'theme-color', name: 'theme-color', content: color }
    ],
    link: [
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.json' }
    ],
    htmlAttrs: {
      lang: 'en'
    },
    bodyAttrs: {
      class: 'athlete-theme'
    }
  })
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator color="var(--journey-action)" :height="2" />
    <ImpersonationBanner />
    <ClientOnly>
      <CoachingBanner />
    </ClientOnly>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ClientOnly>
      <UpgradeModal v-model:open="isOpen" v-bind="options" />
    </ClientOnly>
  </UApp>
</template>
