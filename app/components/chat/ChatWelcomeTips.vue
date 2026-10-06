<template>
  <div class="flex h-full min-h-64 flex-col justify-center py-10 sm:py-16">
    <h2 class="text-2xl sm:text-3xl font-semibold text-highlighted leading-tight">
      {{ t('welcome_title') }}
    </h2>
    <p class="mt-4 max-w-prose text-base text-muted leading-relaxed">
      {{ t('welcome_description') }}
    </p>
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
</script>
