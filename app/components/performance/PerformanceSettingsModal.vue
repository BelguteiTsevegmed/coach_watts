<template>
  <UModal
    v-model:open="isOpen"
    :title="t('sections_modal_title')"
    :description="t('sections_modal_description')"
  >
    <template #body>
      <div class="space-y-4">
        <div
          v-for="section in sectionOptions"
          :key="section.key"
          class="flex items-center justify-between gap-4"
        >
          <label :for="`progress-section-${section.key}`" class="text-sm text-highlighted">
            {{ section.label }}
          </label>
          <USwitch
            :id="`progress-section-${section.key}`"
            v-model="settings[section.key].visible"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          @click="
            () => {
              resetDefaults()
            }
          "
        >
          {{ t('sections_modal_reset') }}
        </UButton>
        <UButton
          color="primary"
          @click="
            () => {
              isOpen = false
            }
          "
        >
          {{ t('sections_modal_done') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { useDebounceFn } from '@vueuse/core'
  import { useTranslate } from '@tolgee/vue'
  import {
    POWER_SECTION_KEYS,
    PROGRESS_SECTION_KEYS,
    resolveSectionVisibility,
    type ProgressSectionKey
  } from '~/utils/progress-summary'

  const props = defineProps<{
    /** Hide power-only sections from the list for athletes without power data. */
    showPowerSections: boolean
    showNutrition: boolean
  }>()

  const isOpen = defineModel<boolean>('open', { default: false })
  const userStore = useUserStore()
  const { t } = useTranslate('performance')

  const stored = () => userStore.user?.dashboardSettings?.performanceSections
  const settings = ref(resolveSectionVisibility(stored()))
  // Skip the save triggered by re-syncing from the store when the modal opens.
  let syncing = false

  watch(
    () => isOpen.value,
    (open) => {
      if (open) {
        syncing = true
        settings.value = resolveSectionVisibility(stored())
        void nextTick(() => {
          syncing = false
        })
      }
    }
  )

  const saveSettings = useDebounceFn(async () => {
    const currentDashboardSettings = userStore.user?.dashboardSettings || {}
    await userStore.updateDashboardSettings({
      ...currentDashboardSettings,
      performanceSections: settings.value
    })
  }, 500)

  watch(
    settings,
    () => {
      if (!syncing) void saveSettings()
    },
    { deep: true }
  )

  const labelKeys: Record<ProgressSectionKey, string> = {
    goals: 'section_goals',
    pmc: 'section_pmc',
    volume: 'section_volume',
    distribution: 'section_distribution',
    records: 'section_records',
    powerCurve: 'section_power_curve',
    efficiency: 'section_efficiency',
    ftp: 'section_ftp',
    athleteProfile: 'section_athlete_profile',
    workoutScores: 'section_workout_scores',
    nutritionScores: 'section_nutrition_scores'
  }

  const sectionOptions = computed(() =>
    PROGRESS_SECTION_KEYS.filter((key) => {
      if (!props.showPowerSections && POWER_SECTION_KEYS.includes(key)) return false
      if (!props.showNutrition && key === 'nutritionScores') return false
      return true
    }).map((key) => ({ key, label: t.value(labelKeys[key]) }))
  )

  function resetDefaults() {
    settings.value = resolveSectionVisibility(null)
  }
</script>
