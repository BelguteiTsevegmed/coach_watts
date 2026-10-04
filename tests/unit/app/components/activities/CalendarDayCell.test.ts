// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { computed } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import CalendarDayCell from '../../../../../app/components/CalendarDayCell.vue'
import type { CalendarActivity } from '../../../../../app/types/calendar'

vi.mock('@tolgee/vue', () => ({
  useTranslate: () => ({
    t: computed(
      () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}:${JSON.stringify(params)}` : key
    )
  })
}))

vi.mock('../../../../../app/composables/useFormat', () => ({
  useFormat: () => ({
    formatDate: () => '06:30',
    formatDateUTC: (date: Date | string, pattern: string) => {
      const d = new Date(date)
      if (pattern === 'd') return String(d.getUTCDate())
      return d.toISOString().slice(0, 10)
    },
    formatTime: () => '6:30 AM',
    getUserLocalDate: () => new Date(Date.UTC(2026, 9, 4)),
    formatWeight: (kg: number) => `${kg}`
  })
}))

vi.mock('../../../../../app/stores/user', () => ({
  useUserStore: () => ({ profile: { distanceUnits: 'Kilometers' } })
}))

const completedRun: CalendarActivity = {
  id: 'w1',
  title: 'Easy Run + 4 strides with a long title that should wrap',
  date: '2026-10-02T06:30:00.000Z',
  type: 'Run',
  source: 'completed',
  status: 'completed',
  duration: 3000,
  distance: 8330,
  tss: 41,
  averageHr: 139,
  ctl: 34,
  atl: 41,
  wellness: { hrv: 60, hoursSlept: 8.1, restingHr: 51 },
  nutrition: {
    calories: 0,
    caloriesGoal: 3061,
    protein: 0,
    proteinGoal: 112,
    carbs: 0,
    carbsGoal: 228,
    fat: 0,
    fatGoal: 70
  }
}

const missedRun: CalendarActivity = {
  id: 'p1',
  title: 'Tempo',
  date: '2026-10-02T00:00:00.000Z',
  type: 'Run',
  source: 'planned',
  status: 'missed',
  plannedDuration: 3000
}

function mountCell(settings?: Record<string, boolean>) {
  return mount(CalendarDayCell, {
    props: {
      date: new Date(Date.UTC(2026, 9, 2)),
      activities: [completedRun, missedRun],
      isOtherMonth: false,
      settings
    },
    global: {
      stubs: {
        UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
        UButton: { template: '<button><slot /></button>' },
        UTooltip: { template: '<span><slot /></span>' },
        UBadge: { template: '<span><slot /></span>' },
        MiniWorkoutChart: true,
        MiniZoneChart: true
      }
    }
  })
}

describe('CalendarDayCell default display', () => {
  it('shows the session, its duration and distance, and a done mark', () => {
    const wrapper = mountCell()
    const sessions = wrapper.findAll('[data-testid="calendar-session"]')

    expect(sessions).toHaveLength(2)
    const completed = sessions.find((s) => s.attributes('data-status') === 'completed')!
    expect(completed.text()).toContain('Easy Run + 4 strides')
    expect(completed.text()).toContain('50m')
    expect(completed.text()).toContain('8.3 km')
    expect(completed.find('[data-icon="i-tabler-run"]').exists()).toBe(true)
    expect(completed.find('[data-icon="i-heroicons-check-circle-solid"]').exists()).toBe(true)
    // Titles wrap to two lines instead of being cut to one.
    expect(completed.find('.line-clamp-2').text()).toContain('long title that should wrap')
  })

  it('labels a missed session in words', () => {
    const wrapper = mountCell()
    const missed = wrapper.find('[data-status="missed"]')

    expect(missed.text()).toContain('status_missed')
  })

  it('hides load numbers, wellness, heart rate and fuel targets by default', () => {
    const text = mountCell().text()

    expect(text).not.toContain('load_fitness')
    expect(text).not.toContain('TSS')
    expect(text).not.toContain('139')
    expect(text).not.toContain('3061')
    expect(text).not.toContain('8.1')
  })

  it('shows each opt-in layer when its setting is on', () => {
    const text = mountCell({
      showTrainingStress: true,
      showWellness: true,
      showNutrition: true,
      showSessionDetails: true
    }).text()

    expect(text).toContain('load_fitness')
    expect(text).toContain('41 TSS')
    expect(text).toContain('139')
    expect(text).toContain('3061')
    expect(text).toContain('8.1')
  })
})
