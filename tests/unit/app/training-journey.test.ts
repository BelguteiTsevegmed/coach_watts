// @vitest-environment nuxt

import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { format } from 'date-fns'
import ActivitiesPage from '../../../app/pages/activities.vue'
import PlanPage from '../../../app/pages/plan.vue'
import PlanWizard from '../../../app/components/plans/PlanWizard.vue'

vi.mock('@tolgee/vue', () => ({
  useTranslate: () => {
    const t = (key: string) => key
    ;(t as any).value = t
    return { t }
  }
}))
vi.mock('~/stores/user', () => ({
  useUserStore: () => ({
    profile: { dob: null, nutritionTrackingEnabled: false },
    user: { dashboardSettings: {}, nutritionTrackingEnabled: false }
  })
}))

const routeState = { query: {} as Record<string, string> }
const navigate = vi.fn()
const fetchMock = vi.fn()
const activePlanData = ref<any>({ plan: null })
const calendarData = ref<any>(null)
const today = () => new Date('2026-10-05T00:00:00Z')

function asyncResult(data: unknown) {
  const result = {
    data: ref(data),
    status: ref('success'),
    pending: ref(false),
    error: ref(null),
    refresh: vi.fn()
  }
  return Object.assign(Promise.resolve(result), result)
}

mockNuxtImport('useRoute', () => () => routeState)
mockNuxtImport(
  'navigateTo',
  () =>
    (...args: any[]) =>
      navigate(...args)
)
mockNuxtImport('useFormat', () => () => ({
  formatDate: (date: string | Date, pattern = 'MMM d, yyyy') => format(new Date(date), pattern),
  formatDateUTC: (date: string | Date, pattern = 'MMM d, yyyy') => format(new Date(date), pattern),
  formatDateTime: () => '',
  formatTime: () => '',
  getUserLocalDate: () => today(),
  timezone: ref('UTC'),
  calculateAge: () => 0
}))
mockNuxtImport('useAuth', () => () => ({
  status: ref('authenticated'),
  data: ref({ user: { termsAcceptedAt: '2026-10-05' } }),
  getSession: vi.fn().mockResolvedValue({}),
  signOut: vi.fn()
}))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))
mockNuxtImport('useIntegrationStore', () => () => ({
  syncingData: false,
  integrationStatus: { integrations: [] }
}))
mockNuxtImport('useWorkoutComparisonStore', () => () => ({
  isSelected: () => false,
  toggleWorkout: vi.fn()
}))
mockNuxtImport('useUserRunsState', () => () => ({
  onTaskCompleted: vi.fn(),
  onTaskFailed: vi.fn()
}))
mockNuxtImport('useTriggerMonitor', () => () => ({ toggle: vi.fn() }))
mockNuxtImport('useLibrarySource', () => () => ({
  source: ref('personal'),
  isCoachingMode: ref(false)
}))
mockNuxtImport('useActivityRealtime', () => () => undefined)
mockNuxtImport('useUpgradeModal', () => () => ({ show: vi.fn() }))
mockNuxtImport('useResourceShare', () => () => ({
  shareLink: ref(''),
  generatingShareLink: ref(false),
  generateShareLink: vi.fn()
}))
mockNuxtImport('useFetch', () => (url: string) => {
  if (url === '/api/plans/active') {
    const result = { data: activePlanData, status: ref('success'), refresh: vi.fn() }
    return Object.assign(Promise.resolve(result), result)
  }
  if (url === '/api/calendar') {
    const result = { data: calendarData, status: ref('success'), refresh: vi.fn() }
    return Object.assign(Promise.resolve(result), result)
  }
  return asyncResult({ profile: { sportSettings: [] } })
})
mockNuxtImport('useLazyFetch', () => () => asyncResult([]))
mockNuxtImport('useAsyncData', () => () => asyncResult(null))

const stubs = {
  UDashboardPanel: { template: '<div><slot name="header" /><slot name="body" /></div>' },
  UDashboardNavbar: { template: '<div><slot name="leading" /><slot name="right" /></div>' },
  UModal: { template: '<section><slot name="body" /><slot name="footer" /></section>' },
  UFormField: { props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  UButton: {
    props: ['to', 'loading', 'disabled'],
    template: '<button :data-to="to" :disabled="loading || disabled"><slot /></button>'
  },
  ClientOnly: { template: '<div><slot /></div>' }
}

async function mountPage(component: any) {
  const wrapper = await mountSuspended(component, {
    shallow: true,
    global: { renderStubDefaultSlot: true, stubs }
  })
  await flushPromises()
  return wrapper
}

const goal = {
  id: 'goal-1',
  title: 'Finish the autumn event',
  targetDate: '2026-12-01',
  priority: 'MEDIUM',
  events: []
}
const draftPlan = {
  id: 'draft-1',
  strategy: 'LINEAR',
  startDate: '2026-10-05',
  blocks: [
    {
      id: 'block-1',
      name: 'Base',
      type: 'BASE',
      primaryFocus: 'ENDURANCE',
      startDate: '2026-10-05',
      durationWeeks: 4
    }
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  routeState.query = {}
  activePlanData.value = { plan: null }
  calendarData.value = {
    activities: [
      {
        id: 'planned-1',
        source: 'planned',
        status: 'planned',
        type: 'Ride',
        title: 'Easy endurance',
        date: '2026-10-06',
        plannedDuration: 3600
      }
    ],
    nutritionByDate: {},
    wellnessByDate: {}
  }
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/goals') return { goals: [goal] }
    if (url === '/api/plans/initialize') return { plan: draftPlan }
    if (url === '/api/planned-workouts') return []
    return {}
  })
  ;(fetchMock as any).raw = vi
    .fn()
    .mockResolvedValue({ _data: { user: { termsAcceptedAt: '2026-10-05' } } })
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Training week', () => {
  it('opens on seven days without rendering the month-long Sessions table', async () => {
    const wrapper = await mountPage(ActivitiesPage)
    const week = wrapper.get('[data-testid="training-week"]')
    expect(week.findAll('h2')).toHaveLength(7)
    expect(week.text()).toContain('Easy endurance')
    expect(wrapper.findComponent({ name: 'UTable' }).exists()).toBe(false)
    expect(wrapper.get('[data-to="/workouts/planned/planned-1"]').text()).toContain(
      'review_next_session'
    )

    const view = wrapper.findComponent({ name: 'USelect' })
    view.vm.$emit('update:modelValue', 'list')
    await nextTick()
    expect(wrapper.find('[data-testid="training-week"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'UTable' }).exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('Plan setup', () => {
  it('sends availability before generating phases and activates after review', async () => {
    const wrapper = await mountPage(PlanWizard)
    await wrapper.get('[role="radio"]').trigger('click')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Set my availability')!
      .trigger('click')
    expect(wrapper.get('[data-testid="plan-availability"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="plan-expert-options"]').attributes('open')).toBeUndefined()
    wrapper
      .findComponent({ name: 'UTextarea' })
      .vm.$emit('update:modelValue', 'Keep Friday free. Train Tuesday and Sunday.')
    await nextTick()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Build my plan')!
      .trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plans/initialize',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          goalId: 'goal-1',
          customInstructions: 'Keep Friday free. Train Tuesday and Sunday.',
          volumeHours: 6
        })
      })
    )
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Check my schedule')!
      .trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Review my plan')!
      .trigger('click')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start training')!
      .trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plans/draft-1/activate',
      expect.objectContaining({ method: 'POST' })
    )
    expect(wrapper.emitted('plan-created')?.[0]).toEqual([draftPlan])
    wrapper.unmount()
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/plans/draft-1/abandon')).toBe(false)
  })

  it('returns successful setup to Today only when explicitly requested', async () => {
    routeState.query = { returnTo: '/dashboard' }
    const wrapper = await mountPage(PlanPage)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Create my plan')!
      .trigger('click')
    wrapper.findComponent({ name: 'PlanWizard' }).vm.$emit('plan-created', draftPlan)
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith('/dashboard')
    wrapper.unmount()
  })
})
