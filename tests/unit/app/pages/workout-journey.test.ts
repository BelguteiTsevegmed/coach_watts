// @vitest-environment nuxt

import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import CompletedWorkoutPage from '../../../../app/pages/workouts/[id]/index.vue'
import { useUserStore } from '../../../../app/stores/user'

function makeTranslateStub() {
  const t = (key: string) => key
  ;(t as any).value = t
  return t
}
vi.mock('@tolgee/vue', () => ({ useTranslate: () => ({ t: makeTranslateStub() }) }))

const authData = ref<any>({ user: { isAdmin: false } })
mockNuxtImport('useAuth', () => () => ({ data: authData }))

const pageRoute = reactive({ params: { id: 'session-1' }, query: {}, hash: '' })
mockNuxtImport('useRoute', () => () => pageRoute)
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))
mockNuxtImport('useFormat', () => () => ({
  formatDate: () => 'September 30, 2026',
  formatDateTime: () => 'September 30, 2026',
  formatDateUTC: () => 'September 30, 2026',
  formatTime: () => '9:00'
}))
mockNuxtImport('useAnalytics', () => () => ({
  trackWorkoutViewDetail: vi.fn(),
  trackWorkoutSectionView: vi.fn()
}))
mockNuxtImport('useUserRuns', () => () => ({ refresh: vi.fn() }))
mockNuxtImport('useUserRunsState', () => () => ({
  runs: ref([]),
  onTaskCompleted: vi.fn(),
  onTaskFailed: vi.fn()
}))
mockNuxtImport('useQuotaPaywall', () => () => ({
  showQuotaPaywall: vi.fn(),
  getOperationQuota: vi.fn(),
  isQuotaExhausted: () => false
}))

function buildWorkout(overrides: Record<string, any> = {}) {
  return {
    id: 'session-1',
    title: 'Steady endurance ride',
    type: 'Ride',
    date: '2026-09-30T09:00:00Z',
    source: 'fit_file',
    durationSec: 3600,
    distanceMeters: 30000,
    averageWatts: 175,
    averageHr: 135,
    tss: 42,
    ctl: 40,
    atl: 45,
    notes: null,
    kilojoules: 630,
    aiAnalysis: 'Coaching review',
    aiAnalysisJson: { executive_summary: 'You kept the effort steady throughout the ride.' },
    streams: { time: [0, 1, 2], watts: [175, 175, 175], heartrate: [134, 135, 136] },
    rawJson: { device: 'test' },
    tags: [],
    ...overrides
  }
}

const wrappers: VueWrapper[] = []
async function mountPage(attachTo?: HTMLElement) {
  const wrapper = await mountSuspended(CompletedWorkoutPage, {
    attachTo,
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
        UButton: {
          props: ['label', 'disabled'],
          template: '<button type="button" :disabled="disabled"><slot>{{ label }}</slot></button>'
        }
      }
    }
  })
  wrappers.push(wrapper)
  await flushPromises()
  await nextTick()
  return wrapper
}

async function chooseView(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('nav button').find((item) => item.text() === label)
  expect(button).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
  await nextTick()
}

describe('Completed workout journey', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    authData.value = { user: { isAdmin: false } }
    pageRoute.params.id = 'session-1'
    pageRoute.hash = ''
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/workouts/session-1' || url === '/api/workouts/session-2')
        return buildWorkout({ id: pageRoute.params.id })
      if (url.endsWith('/analyze')) return { status: 'PENDING' }
      throw new Error(`Unhandled fetch in test: ${url}`)
    })
    ;(fetchMock as any).raw = vi.fn().mockResolvedValue({ _data: null })
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('follows the reflection link after data loads and section hashes on the same page', async () => {
    const scrolledSections: string[] = []
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (
      this: HTMLElement
    ) {
      scrolledSections.push(this.id)
    })
    let resolveWorkout: ((workout: any) => void) | undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWorkout = resolve
        })
    )
    pageRoute.hash = '#notes'
    const wrapper = await mountPage(document.body)
    expect(wrapper.find('#notes').exists()).toBe(false)
    expect(scrolledSections).toEqual([])
    resolveWorkout!(buildWorkout())
    await flushPromises()
    await nextTick()
    expect(wrapper.find('#notes').exists()).toBe(true)
    expect(scrolledSections).toContain('notes')
    pageRoute.hash = '#analysis'
    await flushPromises()
    await nextTick()
    expect(wrapper.find('#analysis').exists()).toBe(true)
    expect(scrolledSections).toContain('analysis')
    pageRoute.hash = '#notes'
    await flushPromises()
    await nextTick()
    expect(wrapper.find('#notes').exists()).toBe(true)
    expect(wrapper.find('#analysis').exists()).toBe(false)
  })

  it('opens with the actual coaching takeaway and reflection, keeping technical panels closed', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('You kept the effort steady throughout the ride.')
    expect(wrapper.find('#notes').exists()).toBe(true)
    expect(wrapper.find('#analysis').exists()).toBe(false)
    expect(wrapper.find('#metrics').exists()).toBe(false)
    expect(wrapper.find('#streams').exists()).toBe(false)
    expect(wrapper.find('#nutrition').element.tagName).toBe('DETAILS')
    expect(wrapper.find('#nutrition').attributes('open')).toBeUndefined()
    expect(
      wrapper
        .findAll('nav button')
        .find((button) => button.text() === 'journey_summary')
        ?.attributes('aria-pressed')
    ).toBe('true')
  })

  it('reveals analysis immediately when requested and keeps the existing analysis request', async () => {
    const wrapper = await mountPage()
    await chooseView(wrapper, 'journey_analysis')
    expect(wrapper.find('#analysis').exists()).toBe(true)
    expect(wrapper.find('#notes').exists()).toBe(false)
    expect(wrapper.find('#metrics').exists()).toBe(false)
    const regenerate = wrapper
      .findAll('#analysis button')
      .find((button) => button.text() === 'analysis_button_regenerate')
    expect(regenerate).toBeDefined()
    await regenerate!.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/workouts/session-1/analyze', { method: 'POST' })
  })

  it('makes detailed metrics and stream drill-down reachable on demand', async () => {
    const wrapper = await mountPage()
    await chooseView(wrapper, 'journey_details')
    expect(wrapper.find('#analysis').exists()).toBe(false)
    expect(wrapper.find('#notes').exists()).toBe(false)
    expect(wrapper.find('#metrics').exists()).toBe(true)
    expect(wrapper.find('#raw-data').exists()).toBe(false)
    await wrapper.find('#metrics button').trigger('click')
    expect(wrapper.find('workouts-metric-detail-modal-stub').exists()).toBe(true)
    const stream = wrapper
      .findAll('#streams button')
      .find((button) => button.text() === 'metrics_avg_power')
    expect(stream).toBeDefined()
    await stream!.trigger('click')
    expect(wrapper.find('stream-chart-modal-stub').attributes('streamkey')).toBe('watts')
  })

  it('shows raw data only for an admin while preserving athlete drill-downs', async () => {
    const wrapper = await mountPage()
    await chooseView(wrapper, 'journey_details')
    expect(wrapper.find('#raw-data').exists()).toBe(false)
    expect(wrapper.find('#metrics').exists()).toBe(true)
    expect(wrapper.find('#streams').exists()).toBe(true)

    authData.value = { user: { isAdmin: true } }
    await nextTick()
    expect(wrapper.find('#raw-data').exists()).toBe(true)

    authData.value = { user: { isAdmin: false } }
    await nextTick()
    expect(wrapper.find('#raw-data').exists()).toBe(false)
  })

  it('respects existing section visibility preferences after changing views', async () => {
    const wrapper = await mountPage()
    const store = useUserStore((wrapper.vm as any).$pinia)
    store.user = {
      dashboardSettings: { workoutDetailSections: { streams: { visible: false } } }
    } as any
    await nextTick()
    await chooseView(wrapper, 'journey_details')
    expect(wrapper.find('#streams').exists()).toBe(false)
    expect(wrapper.find('#metrics').exists()).toBe(true)
  })

  it('returns the next workout to Summary rather than carrying over the technical view', async () => {
    const wrapper = await mountPage()
    await chooseView(wrapper, 'journey_details')
    pageRoute.params.id = 'session-2'
    await flushPromises()
    await nextTick()
    expect(wrapper.find('#notes').exists()).toBe(true)
    expect(wrapper.find('#metrics').exists()).toBe(false)
    expect(
      wrapper
        .findAll('nav button')
        .find((button) => button.text() === 'journey_summary')
        ?.attributes('aria-pressed')
    ).toBe('true')
  })

  it('gives a way back when the session is missing', async () => {
    fetchMock.mockResolvedValueOnce(null)
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('journey_not_found')
    expect(wrapper.text()).toContain('journey_not_found_hint')
    expect(wrapper.find('#notes').exists()).toBe(false)
    expect(wrapper.find('nav').exists()).toBe(false)
  })
})
