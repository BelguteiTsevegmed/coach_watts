<template>
  <UModal
    v-model:open="isOpen"
    :title="t('settings_title')"
    :description="t('settings_description')"
  >
    <template #body>
      <div class="space-y-6" data-testid="calendar-settings">
        <section
          v-for="(section, index) in sections"
          :key="section.id"
          class="space-y-4"
          :class="index > 0 ? 'border-t border-gray-200 dark:border-gray-800 pt-6' : ''"
        >
          <h4 class="font-medium text-gray-900 dark:text-white text-sm">{{ section.title }}</h4>

          <div
            v-for="option in section.options"
            :key="option.key"
            class="flex items-center justify-between gap-4"
          >
            <div class="space-y-0.5">
              <div class="text-sm font-medium text-gray-900 dark:text-white">
                {{ option.label }}
              </div>
              <div class="text-xs text-muted">{{ option.description }}</div>
            </div>
            <USwitch
              :model-value="settings[option.key]"
              :aria-label="option.label"
              :data-testid="`calendar-setting-${option.key}`"
              @update:model-value="(value: boolean) => updateSetting(option.key, value)"
            />
          </div>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          @click="
            () => {
              void resetDefaults()
            }
          "
        >
          {{ t('settings_reset') }}
        </UButton>
        <UButton
          color="primary"
          @click="
            () => {
              isOpen = false
            }
          "
        >
          {{ t('settings_done') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { useDebounceFn } from '@vueuse/core'
  import {
    resolveActivityCalendarSettings,
    type ActivityCalendarSettingKey,
    type ActivityCalendarSettings
  } from '~/utils/calendarDisplay'

  const props = withDefaults(defineProps<{ nutritionEnabled?: boolean }>(), {
    nutritionEnabled: true
  })

  const isOpen = defineModel<boolean>('open', { default: false })
  const userStore = useUserStore()
  const { t } = useTranslate('activities')

  function storedSettings(): Record<string, unknown> {
    const stored = userStore.user?.dashboardSettings?.activityCalendar
    return stored && typeof stored === 'object' ? { ...stored } : {}
  }

  // Only keys the athlete has actually changed are persisted, so improving a default later still
  // reaches everyone who never touched that switch.
  const overrides = ref<Record<string, unknown>>(storedSettings())
  const settings = computed<ActivityCalendarSettings>(() =>
    resolveActivityCalendarSettings(overrides.value)
  )

  watch(
    () => isOpen.value,
    (open) => {
      if (open) overrides.value = storedSettings()
    }
  )

  const saveSettings = useDebounceFn(async () => {
    // Merge with existing dashboard settings to avoid overwriting other widgets
    const currentDashboardSettings = userStore.user?.dashboardSettings || {}

    await userStore.updateDashboardSettings({
      ...currentDashboardSettings,
      activityCalendar: { ...overrides.value }
    })
  }, 500)

  function updateSetting(key: ActivityCalendarSettingKey, value: boolean) {
    overrides.value = { ...overrides.value, [key]: value }
    void saveSettings()
  }

  function resetDefaults() {
    overrides.value = {}
    void saveSettings()
  }

  interface SettingOption {
    key: ActivityCalendarSettingKey
    label: string
    description: string
  }

  const sections = computed(() => {
    const result: { id: string; title: string; options: SettingOption[] }[] = [
      {
        id: 'details',
        title: t.value('settings_section_details'),
        options: [
          {
            key: 'showSessionDetails',
            label: t.value('settings_session_details'),
            description: t.value('settings_session_details_hint')
          },
          {
            key: 'showTrainingStress',
            label: t.value('settings_training_stress'),
            description: t.value('settings_training_stress_hint')
          },
          {
            key: 'showWellness',
            label: t.value('settings_wellness'),
            description: t.value('settings_wellness_hint')
          }
        ]
      }
    ]

    if (props.nutritionEnabled) {
      result.push({
        id: 'nutrition',
        title: t.value('settings_section_nutrition'),
        options: [
          {
            key: 'showNutrition',
            label: t.value('settings_nutrition'),
            description: t.value('settings_nutrition_hint')
          },
          {
            key: 'showFuelState',
            label: t.value('settings_fuel_state'),
            description: t.value('settings_fuel_state_hint')
          },
          {
            key: 'showMetabolicWave',
            label: t.value('settings_metabolic_wave'),
            description: t.value('settings_metabolic_wave_hint')
          }
        ]
      })
    }

    result.push({
      id: 'layout',
      title: t.value('settings_section_layout'),
      options: [
        {
          key: 'showWeekSeparator',
          label: t.value('settings_week_separator'),
          description: t.value('settings_week_separator_hint')
        },
        {
          key: 'reverseWeekOrder',
          label: t.value('settings_reverse_weeks'),
          description: t.value('settings_reverse_weeks_hint')
        },
        {
          key: 'alignActivitiesByTime',
          label: t.value('settings_align_by_time'),
          description: t.value('settings_align_by_time_hint')
        }
      ]
    })

    return result
  })
</script>
