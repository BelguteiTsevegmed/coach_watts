<template>
  <div
    class="flex flex-col items-center justify-start sm:justify-center min-h-full text-center px-4 py-5 sm:p-6 text-gray-500 dark:text-gray-400"
  >
    <div class="hidden sm:block mb-5 p-4 rounded-full bg-primary-50 dark:bg-primary-900/20">
      <UIcon name="i-heroicons-sparkles" class="w-9 h-9 text-primary-500" />
    </div>
    <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-2">{{ t('welcome_title') }}</h2>
    <p class="max-w-md mb-5 sm:mb-6 text-sm">
      {{ t('welcome_description') }}
    </p>

    <div class="grid grid-cols-2 gap-2 max-w-xl w-full text-left">
      <button
        v-for="starter in starters"
        :key="starter.key"
        type="button"
        class="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 text-left rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm hover:border-primary-300 dark:hover:border-primary-700 focus-visible:outline-2 focus-visible:outline-primary-500 transition-colors"
        :data-testid="`chat-starter-${starter.key}`"
        @click="emit('prompt', t(`welcome_starter_${starter.key}_message`))"
      >
        <div class="p-1.5 sm:p-2 rounded-lg bg-primary-50 dark:bg-primary-950/50 shrink-0">
          <UIcon :name="starter.icon" class="w-4 h-4 text-primary-500" />
        </div>
        <span class="text-xs sm:text-sm font-medium leading-snug text-gray-900 dark:text-white">
          {{ t(`welcome_starter_${starter.key}_label`) }}
        </span>
      </button>
    </div>

    <p class="hidden sm:block max-w-md mt-6 text-xs">{{ t('welcome_tip_fresh_desc') }}</p>

    <div
      class="mt-4 max-w-md flex items-center gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 text-orange-600 dark:text-orange-400"
    >
      <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 shrink-0" />
      <span class="text-[10px] leading-tight text-left">{{ t('welcome_disclaimer') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  const { t } = useTranslate('chat')

  const emit = defineEmits<{
    prompt: [text: string]
  }>()

  const starters = [
    { key: 'today', icon: 'i-lucide-sunrise' },
    { key: 'progress', icon: 'i-lucide-trending-up' },
    { key: 'week', icon: 'i-lucide-calendar-range' },
    { key: 'niggle', icon: 'i-lucide-bandage' },
    { key: 'recovery', icon: 'i-lucide-battery-medium' },
    { key: 'goal', icon: 'i-lucide-flag' }
  ]
</script>
