<template>
  <UModal
    v-model:open="isOpen"
    :title="t('pain_update_title')"
    :description="t('pain_update_desc')"
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <div class="space-y-5">
        <div class="flex items-center gap-4">
          <span
            class="w-12 shrink-0 text-center text-3xl font-black tabular-nums"
            :class="painColorClass"
          >
            {{ pain }}
          </span>
          <USlider
            v-model="pain"
            :min="0"
            :max="10"
            :step="1"
            :color="painSliderColor"
            class="flex-1"
          />
        </div>
        <p class="text-xs text-muted">{{ t(`pain_${band}`) }}</p>

        <UFormField :label="t('pain_update_note')" name="note">
          <UTextarea v-model="note" :rows="2" maxlength="500" class="w-full" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('cancel')"
          @click="
            () => {
              isOpen = false
            }
          "
        />
        <UButton
          color="primary"
          :label="t('save')"
          :loading="saving"
          @click="
            () => {
              emit('submit', { painLevel: pain, note: note.trim() })
            }
          "
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { getPainBand } from '#shared/injuries'

  const props = defineProps<{
    open: boolean
    painLevel: number
    saving?: boolean
  }>()

  const emit = defineEmits<{
    'update:open': [value: boolean]
    submit: [payload: { painLevel: number; note: string }]
  }>()

  const { t } = useTranslate('injuries')

  const isOpen = computed({
    get: () => props.open,
    set: (value: boolean) => emit('update:open', value)
  })

  const pain = ref(props.painLevel)
  const note = ref('')

  watch(
    () => props.open,
    (open) => {
      if (open) {
        pain.value = props.painLevel
        note.value = ''
      }
    }
  )

  const band = computed(() => getPainBand(pain.value))
  const painColorClass = computed(() =>
    band.value === 'severe'
      ? 'text-error'
      : band.value === 'moderate'
        ? 'text-warning'
        : 'text-success'
  )
  const painSliderColor = computed(() =>
    band.value === 'severe' ? 'error' : band.value === 'moderate' ? 'warning' : 'success'
  )
</script>
