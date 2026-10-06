// @vitest-environment nuxt

import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { nextTick, ref, watch } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PerformancePage from '../../../app/pages/performance/index.vue'

vi.mock('@tolgee/vue', () => ({
  useTranslate: () => {
    const t = (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key
    ;(t as any).value = t
    return { t }
  }
}))

const profileData = ref<any>(null)
const recentWorkoutsData = ref<any[]>([])
const asyncDataKeys: string[] = []
const workoutData = ref<any>(null)
const nutritionData = ref<any>(null)
const workoutError = ref<Error | null>(null)
const nutritionEnabled = ref(true)
const displaySettings = ref<Record<string, { visible: boolean }>>({})
const refreshWorkouts = vi.fn()
const refreshNuxtData = vi.fn()
const fetchMock = vi.fn()

mockNuxtImport('useUserStore', () => () => ({
  get user() {
    return {
      nutritionTrackingEnabled: nutritionEnabled.value,
      dashboardSettings: { performanceSections: displaySettings.value }
    }
  },
  get profile() {
    return { nutritionTrackingEnabled: nutritionEnabled.value }
  }
}))
mockNuxtImport('useIntegrationStore', () => () => ({ integrationStatus: { integrations: [] } }))
mockNuxtImport('useFormat', () => () => ({
  formatDate: () => 'Oct 5, 2026',
  getUserLocalDate: () => new Date('2026-10-05T00:00:00Z'),
  timezone: ref('UTC')
}))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))
mockNuxtImport('useUserRuns', () => () => ({ refresh: vi.fn() }))
mockNuxtImport('useUserRunsState', () => () => ({
  onTaskCompleted: vi.fn(),
  onTaskFailed: vi.fn()
}))
mockNuxtImport(
  'refreshNuxtData',
  () =>
    (...args: any[]) =>
      refreshNuxtData(...args)
)
mockNuxtImport(
  'useAsyncData',
  () => (key: string, handler: () => Promise<unknown>, options?: any) => {
    asyncDataKeys.push(key)
    const data =
      key === 'athlete-profile'
        ? profileData
        : key === 'progress-recent-workouts'
          ? recentWorkoutsData
          : key === 'performance-workout-trends'
            ? workoutData
            : key === 'performance-nutrition-trends'
              ? nutritionData
              : ref(null)
    const refresh = key === 'progress-recent-workouts' ? refreshWorkouts : vi.fn(handler)
    if (options?.watch)
      watch(options.watch, () => {
        void refresh()
      })
    const result = {
      data,
      pending: ref(false),
      error: key === 'progress-recent-workouts' ? workoutError : ref(null),
      refresh
    }
    return Object.assign(Promise.resolve(result), result)
  }
)

async function mountPage() {
  return mountSuspended(PerformancePage, {
    shallow: true,
    global: {
      renderStubDefaultSlot: true,
      stubs: {
        PerformanceCoachScores: false,
        UDashboardPanel: {
          template: '<div><slot name="header" /><slot name="body" /></div>'
        },
        UDashboardNavbar: {
          template: '<div><slot name="leading" /><slot name="right" /></div>'
        },
        UButton: {
          props: ['to', 'loading'],
          template: '<button :data-to="to" :disabled="loading"><slot /></button>'
        },
        ClientOnly: { template: '<div><slot /></div>' }
      }
    }
  })
}

async function openTopic(wrapper: Awaited<ReturnType<typeof mountPage>>, topic: string) {
  const details = wrapper.get(`[data-testid="progress-${topic}"]`)
  ;(details.element as HTMLDetailsElement).open = true
  await details.trigger('toggle')
  await nextTick()
}

describe('Progress journey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asyncDataKeys.length = 0
    profileData.value = {
      scores: { currentFitness: 7, trainingConsistency: 8 },
      personalBests: []
    }
    recentWorkoutsData.value = Array.from({ length: 3 }, (_, index) => ({
      date: `2026-10-0${index + 1}T12:00:00Z`,
      type: 'Ride',
      durationSec: 3600,
      averageWatts: 150
    }))
    workoutData.value = {
      summary: { total: 3, avgOverall: 7.5, avgTechnical: 0 },
      workouts: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-09-${index + 1}`,
        isGhost: index > 2,
        overallScore: 7.5
      }))
    }
    nutritionData.value = { summary: { avgOverall: 7 }, nutrition: [] }
    workoutError.value = null
    nutritionEnabled.value = true
    displaySettings.value = {}
    fetchMock.mockResolvedValue({ cached: true, analysis: { summary: 'An explanation' } })
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('counts real sessions and keeps charts behind topic disclosures', async () => {
    const wrapper = await mountPage()
    expect(
      wrapper.findComponent({ name: 'PerformanceProgressHeadline' }).props('sessions').sessions
    ).toBe(3)
    expect(asyncDataKeys).not.toContain('performance-workout-trends')
    expect(wrapper.findComponent({ name: 'PerformanceGoalProgress' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'PerformancePowerCurveCard' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'PerformanceScoreTrajectoryCard' }).exists()).toBe(false)

    await openTopic(wrapper, 'fitness')
    expect(wrapper.findComponent({ name: 'PerformancePowerCurveCard' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'PerformancePmcCard' }).exists()).toBe(true)
    wrapper.unmount()
  })

  it('makes score explanations keyboard-accessible, including a valid zero score', async () => {
    const wrapper = await mountPage()
    await openTopic(wrapper, 'coach-scores')
    expect(asyncDataKeys).toContain('performance-workout-trends')
    const technical = wrapper
      .findAll('button')
      .find((button) => button.text().includes('workout_technical_title'))
    expect(technical).toBeDefined()
    expect(technical!.attributes('disabled')).toBeUndefined()
    expect(technical!.text()).toContain('0 / 10')
    await technical!.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/scores/explanation', {
      query: { type: 'workout', period: 30, metric: 'technical' }
    })
    expect(wrapper.findComponent({ name: 'ScoreDetailModal' }).props('modelValue')).toBe(true)
    wrapper.unmount()
  })

  it('preserves display settings and keeps fitness available when fueling is disabled', async () => {
    nutritionEnabled.value = false
    displaySettings.value = {
      volume: { visible: false },
      distribution: { visible: false },
      workoutScores: { visible: false },
      powerCurve: { visible: false }
    }
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="progress-training"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="progress-fueling"]').exists()).toBe(false)
    await openTopic(wrapper, 'fitness')
    expect(wrapper.findComponent({ name: 'PerformancePmcCard' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'PerformancePowerCurveCard' }).exists()).toBe(false)
    await openTopic(wrapper, 'coach-scores')
    expect(
      wrapper.findComponent({ name: 'PerformanceCoachScores' }).props('nutritionEnabled')
    ).toBe(false)
    expect(wrapper.text()).not.toContain('profile_nutrition_title')
    wrapper.unmount()
  })

  it('shows an actionable empty state and retries a failed overview', async () => {
    recentWorkoutsData.value = []
    workoutData.value = { summary: { total: 0 }, workouts: [] }
    const wrapper = await mountPage()
    expect(wrapper.get('[data-testid="progress-empty"]').text()).toContain('overview_empty_help')
    expect(wrapper.get('[data-to="/workouts"]').text()).toBe('view_training')

    workoutError.value = new Error('Unavailable')
    await nextTick()
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('overview_error_help')
    await alert.get('button').trigger('click')
    expect(refreshWorkouts).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('keeps display settings reachable and loads filters and insights when requested', async () => {
    const wrapper = await mountPage()
    await openTopic(wrapper, 'coach-scores')
    wrapper.findAllComponents({ name: 'USelect' })[0]!.vm.$emit('update:modelValue', 90)
    await nextTick()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/scores/workout-trends', {
      query: { days: 90, sport: 'all', tags: '' }
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/scores/nutrition-trends', { query: { days: 90 } })

    const settings = wrapper.findAll('button').find((button) => button.text() === 'nav_customize')!
    await settings.trigger('click')
    expect(wrapper.findComponent({ name: 'PerformanceSettingsModal' }).props('open')).toBe(true)

    const generate = wrapper
      .findAll('button')
      .find((button) => button.text() === 'coach_scores_refresh')!
    await generate.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/scores/generate-explanations', { method: 'POST' })
    wrapper.unmount()
  })
})
