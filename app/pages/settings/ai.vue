<template>
  <div class="space-y-6">
    <UCard :ui="{ ...profileSettingsCardUi, body: 'hidden' }">
      <template #header>
        <h2 class="text-xl font-bold uppercase tracking-tight">{{ t('ai_coach_header') }}</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('ai_coach_description') }}
        </p>
      </template>
    </UCard>

    <!-- Three-column layout for settings, analytics, and charts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SettingsAiCoachSettings
        v-if="aiSettings"
        :settings="aiSettings as any"
        @save="saveAiSettings"
      />

      <div class="flex flex-col gap-6">
        <SettingsAiAutomationSettings
          v-if="aiSettings"
          :settings="aiSettings as any"
          @save="saveAiSettings"
        />
        <ClientOnly>
          <SettingsAiUsageCharts />
        </ClientOnly>
      </div>
    </div>

    <!-- Identity & Context -->
    <SettingsAiIdentitySettings v-if="aiSettings" :settings="aiSettings" @save="saveAiSettings" />

    <!-- Full-width history table below -->
    <ClientOnly>
      <SettingsAiUsageHistory />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { profileSettingsCardUi } from '~/utils/mobile-surface-ui'

  const { t } = useTranslate('settings')
  const toast = useToast()

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'AI Coach Settings',
    meta: [
      {
        name: 'description',
        content: 'Configure your AI coach preferences, personality, and data access.'
      }
    ]
  })

  // Fetch AI settings
  const { data: aiSettings, refresh: refreshSettings } = await useFetch('/api/settings/ai', {
    lazy: true,
    server: false
  })

  async function saveAiSettings(settings: any) {
    try {
      await $fetch<any, string & {}>('/api/settings/ai', {
        method: 'POST',
        body: settings
      })

      toast.add({
        title: t.value('toast_settings_saved_title'),
        description: t.value('toast_settings_saved_desc'),
        color: 'success'
      })

      // Refresh settings to ensure they're in sync
      await refreshSettings()
    } catch (error: any) {
      toast.add({
        title: t.value('toast_save_failed_title'),
        description: error.data?.message || 'Failed to save AI settings',
        color: 'error'
      })
    }
  }
</script>
