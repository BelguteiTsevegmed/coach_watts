// @vitest-environment nuxt

import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import DashboardPage from '../../../../app/pages/dashboard.vue'
import TodayNotice from '../../../../app/components/dashboard/TodayNotice.vue'

function makeTranslateStub() {
  const t = (key: string) => key
  ;(t as any).value = t
  return t
}

vi.mock('@tolgee/vue', () => ({
  useTranslate: () => ({ t: makeTranslateStub() })
}))

mockNuxtImport('useToast', () => () => ({ add: vi.fn(), update: vi.fn(), toasts: ref([]) }))
mockNuxtImport('useUserRuns', () => () => ({ refresh: vi.fn() }))
mockNuxtImport('useUserRunsState', () => () => ({
  runs: ref([]),
  onTaskCompleted: vi.fn(),
  onTaskFailed: vi.fn()
}))
mockNuxtImport('useAnalytics', () => () => ({ trackWidgetClick: vi.fn() }))
mockNuxtImport('useFormat', () => () => ({
  formatDate: vi.fn(() => ''),
  formatDateUTC: vi.fn(() => '2026-10-04'),
  getUserLocalDate: () => new Date('2026-10-04T00:00:00.000Z')
}))
mockNuxtImport('useTriggerMonitor', () => () => ({ toggle: vi.fn() }))

const ONBOARDED_STATUS = {
  signupMethod: 'unknown',
  currentStep: 'first_value',
  steps: [],
  importState: 'ready',
  connectedProviders: [],
  hasIntegration: false,
  hasAnyData: true,
  hasUsableData: true,
  hasFirstInsight: true,
  activationComplete: true,
  showFullSetupHub: false,
  showCompactSetupCard: false,
  primaryProvider: null,
  workoutCount: 30,
  wellnessCount: 40,
  nutritionCount: 0,
  importErrorMessage: null,
  hasConsent: true,
  hasPrimaryGoal: true,
  hasActivePlan: true
}

function runWorkout(id: string) {
  return {
    id: `workout-${id}`,
    type: 'workout',
    activityType: 'Run',
    date: '2026-10-02T06:30:00.000Z',
    title: 'Easy Run',
    details: [{ label: 'Duration', value: '50m' }]
  }
}

async function mountPage() {
  const wrapper = await mountSuspended(DashboardPage, {
    shallow: true,
    global: {
      renderStubDefaultSlot: true,
      stubs: {
        UDashboardPanel: {
          template: '<div><slot name="header" /><slot name="body" /><slot /></div>'
        },
        UDashboardNavbar: {
          template:
            '<div><slot name="title" /><slot name="leading" /><slot name="right" /><slot /></div>'
        }
      }
    }
  })

  await flushPromises()
  await nextTick()
  await nextTick()
  return wrapper
}

describe('Today screen', () => {
  const fetchMock = vi.fn()
  let recentItems: any[] = []

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    recentItems = [runWorkout('a'), runWorkout('b')]

    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/integrations/status') return { integrations: [] }
      if (url === '/api/profile/dashboard') {
        return {
          profile: { name: 'Runner', nutritionTrackingEnabled: false },
          dataSyncStatus: { workouts: true },
          missingFields: ['Functional Threshold Power (FTP)', 'Training Zones']
        }
      }
      if (url === '/api/user/onboarding-status') return ONBOARDED_STATUS
      if (url === '/api/activity/recent') return { items: recentItems }
      if (url === '/api/calendar') return { activities: [] }
      if (url === '/api/workouts/planned/upcoming') return { workouts: [] }
      throw new Error(`Unhandled fetch in test: ${url}`)
    })
    ;(fetchMock as any).raw = vi.fn().mockResolvedValue({ _data: null })
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('leads with the session and drops the retired dashboard cards', async () => {
    const wrapper = await mountPage()
    const html = wrapper.html()

    expect(html).toContain('today-session-card')
    expect(html).toContain('readiness-strip')
    expect(html).toContain('body-status-card')
    expect(html).toContain('this-week-card')
    expect(html.indexOf('today-session-card')).toBeLessThan(html.indexOf('readiness-strip'))

    expect(html).not.toContain('athlete-profile-card')
    expect(html).not.toContain('monthly-comparison-card')
    expect(html).not.toContain('performance-scores-card')
    expect(html).not.toContain('share-footer-card')
  })

  it('does not ask an athlete without power data for their FTP', async () => {
    const wrapper = await mountPage()
    const notice = wrapper.findComponent(TodayNotice)

    expect(notice.exists()).toBe(true)
    expect(notice.props('missingFields')).toEqual(['Training Zones'])
  })

  it('keeps FTP in the missing list once the athlete rides with power', async () => {
    recentItems = [
      {
        id: 'workout-ride',
        type: 'workout',
        activityType: 'Ride',
        date: '2026-10-02T06:30:00.000Z',
        title: 'Endurance Ride',
        details: [{ label: 'Avg Power', value: '180W' }]
      }
    ]
    const wrapper = await mountPage()
    const notice = wrapper.findComponent(TodayNotice)

    expect(notice.props('missingFields')).toEqual([
      'Functional Threshold Power (FTP)',
      'Training Zones'
    ])
  })
})
