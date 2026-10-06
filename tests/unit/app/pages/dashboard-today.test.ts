// @vitest-environment nuxt

import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import DashboardPage from '../../../../app/pages/dashboard.vue'
import MissingDataBanner from '../../../../app/components/dashboard/MissingDataBanner.vue'

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
        },
        DashboardRecentActivityCard: {
          template: '<div class="recent-activity-stub"><slot name="footer" /></div>'
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
  let integrations: any[] = []

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    recentItems = [runWorkout('a'), runWorkout('b')]
    integrations = []

    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/integrations/status') return { integrations }
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
      if (url === '/api/workouts/planned/today') return []
      if (url === '/api/recommendations/today') return null
      if (url === '/api/checkin/today') return { checkin: null }
      if (url === '/api/performance/pmc') return { summary: { currentTSB: 5, currentCTL: 40 } }
      throw new Error(`Unhandled fetch in test: ${url}`)
    })
    ;(fetchMock as any).raw = vi.fn().mockResolvedValue({ _data: null })
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('leads with the journey and loads readiness and injury context only when requested', async () => {
    const wrapper = await mountPage()
    const html = wrapper.html()

    expect(html).toContain('training-recommendation-card')
    expect(wrapper.findAll('details').every((detail) => !detail.attributes('open'))).toBe(true)
    expect(html).not.toContain('readiness-strip')
    expect(html).not.toContain('body-status-card')
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/performance/pmc')).toBe(false)

    expect(html).not.toContain('athlete-profile-card')
    expect(html).not.toContain('monthly-comparison-card')
    expect(html).not.toContain('performance-scores-card')
    expect(html).not.toContain('share-footer-card')

    const recovery = wrapper
      .findAll('details')
      .find((detail) => detail.get('summary').text() === 'journey_recovery_trends')!
    ;(recovery.element as HTMLDetailsElement).open = true
    await recovery.trigger('toggle')
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toContain('readiness-strip')
    expect(wrapper.html()).toContain('body-status-card')
    expect(fetchMock).toHaveBeenCalledWith('/api/performance/pmc', { query: { days: 7 } })
  })

  it('does not ask an athlete without power data for their FTP', async () => {
    const wrapper = await mountPage()
    const notice = wrapper.findComponent(MissingDataBanner)

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
    const notice = wrapper.findComponent(MissingDataBanner)

    expect(notice.props('missingFields')).toEqual([
      'Functional Threshold Power (FTP)',
      'Training Zones'
    ])
  })

  it('keeps the Garmin attribution on Today when Garmin is connected', async () => {
    const withoutGarmin = await mountPage()
    expect(withoutGarmin.find('[data-testid="garmin-attribution"]').exists()).toBe(false)

    integrations = [{ provider: 'garmin' }]
    const withGarmin = await mountPage()
    expect(withGarmin.find('[data-testid="garmin-attribution"]').exists()).toBe(true)
  })
})
