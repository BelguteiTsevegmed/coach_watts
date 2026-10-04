<template>
  <USelectMenu
    v-if="scopeOptions"
    v-model="scope"
    :items="scopeOptions"
    value-key="value"
    label-key="label"
    class="w-36 sm:w-44"
    size="xs"
    color="neutral"
    variant="outline"
    :aria-label="t('scope_label')"
  />
  <USelect
    v-model="period"
    :items="periodOptions"
    class="w-28 sm:w-36"
    size="xs"
    color="neutral"
    variant="outline"
    :aria-label="t('period_label')"
  />
  <UButton
    icon="i-heroicons-cog-6-tooth"
    color="neutral"
    variant="ghost"
    size="xs"
    :aria-label="t('chart_settings_label')"
    @click="
      () => {
        void $emit('settings')
      }
    "
  />
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'

  defineProps<{
    scopeOptions?: any[]
    periodOptions: any[]
  }>()

  const scope = defineModel<string>('scope')
  const period = defineModel<number | string>('period')

  defineEmits(['settings'])

  const { t } = useTranslate('performance')
</script>
