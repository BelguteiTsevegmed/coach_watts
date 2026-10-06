<template>
  <div class="flex h-full min-h-64 flex-col justify-center py-10 sm:py-16">
    <h2 class="text-2xl sm:text-3xl font-semibold text-highlighted leading-tight">
      {{ t('welcome_title') }}
    </h2>
    <p class="mt-4 max-w-prose text-base text-muted leading-relaxed">
      {{ t('welcome_description') }}
    </p>
    <div class="mt-6 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
      <button
        v-for="starter in starters"
        :key="starter.key"
        type="button"
        class="flex min-h-11 items-center gap-3 rounded-lg border border-default px-4 py-3 text-left text-sm text-default hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :data-testid="`chat-starter-${starter.key}`"
        @click="emit('prompt', t(`welcome_starter_${starter.key}_message`))"
      >
        <UIcon :name="starter.icon" class="h-4 w-4 shrink-0 text-primary" />
        <span>{{ t(`welcome_starter_${starter.key}_label`) }}</span>
      </button>
    </div>
    <details class="mt-6 max-w-prose">
      <summary
        class="min-h-11 cursor-pointer py-3 text-sm text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        {{ t('welcome_guidance') }}
      </summary>
      <div class="space-y-4 pb-3 text-sm text-muted leading-relaxed">
        <p>{{ t('welcome_tip_specific_desc') }}</p>
        <p>{{ t('welcome_tip_fresh_desc') }}</p>
      </div>
    </details>
    <p class="mt-8 max-w-prose text-xs text-muted leading-relaxed">
      {{ t('welcome_disclaimer') }}
    </p>
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
