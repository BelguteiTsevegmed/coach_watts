// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FitnessPage from '../../../app/pages/fitness/index.vue'

const fetchMock = vi.fn()
const recoveryItems = ref<any[]>([])
const refreshRecovery = vi.fn()
const displaySettings = ref<Record<string, any>>({})
const toggleMonitor = vi.fn()
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))
mockNuxtImport('useTheme', () => () => ({ isDark: ref(false) }))
mockNuxtImport('useTriggerMonitor', () => () => ({ toggle: toggleMonitor }))
mockNuxtImport('useUserStore', () => () => ({
  get user() {
    return { dashboardSettings: { fitnessCharts: displaySettings.value } }
  },
  profile: { weightUnits: 'Kilograms' },
  weightUnitLabel: 'kg'
}))
mockNuxtImport('useIntegrationStore', () => () => ({ integrationStatus: { integrations: [] } }))
mockNuxtImport('useFormat', () => () => ({
  formatDateUTC: () => 'Oct 5, 2026',
  getUserLocalDate: () => new Date('2026-10-06T00:00:00Z')
}))
mockNuxtImport('useRecoveryContext', () => () => ({
  items: recoveryItems,
  activeToday: recoveryItems,
  refresh: refreshRecovery
}))
mockNuxtImport('useFetch', () => () => Promise.resolve({ data: ref(null), pending: ref(false) }))
const wrappers: VueWrapper[] = []
async function mountPage() {
  const wrapper = await mountSuspended(FitnessPage, {
    shallow: true,
    global: {
      renderStubDefaultSlot: true,
      stubs: {
        ClientOnly: { template: '<div><slot/></div>' },
        UDashboardPanel: { template: '<div><slot name="body"/></div>' },
        UDropdownMenu: {
          props: ['items'],
          template:
            '<div><slot/><template v-for="group in items"><button v-for="item in group" :key="item.label" @click="item.onSelect?.()">{{ item.label }}</button></template></div>'
        },
        USelect: {
          props: ['modelValue', 'items'],
          emits: ['update:modelValue'],
          template:
            '<select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
        },
        FitnessTrendChart: {
          props: ['metricKey'],
          emits: ['settings'],
          template:
            '<div :data-metric="metricKey"><button @click="$emit(\'settings\')">Settings</button></div>'
        },
        FitnessHrvRhrDualChart: true,
        FitnessSummaryCards: true,
        FitnessSettingsModal: true,
        FitnessChartSettingsModal: true,
        FitnessWellnessTable: {
          props: ['wellness'],
          template: '<div data-test="records">{{ wellness.length }} records</div>'
        },
        RecoveryContextSlideover: true,
        RecoveryContextTimeline: true,
        RecoveryContextStrip: { template: '<div><slot name="actions"/></div>' }
      }
    }
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
async function openTopic(wrapper: VueWrapper, title: string) {
  const details = wrapper.findAll('details').find((entry) => entry.get('summary').text() === title)!
  expect(details).toBeDefined()
  ;(details.element as HTMLDetailsElement).open = true
  await details.trigger('toggle')
  await flushPromises()
}
beforeEach(() => {
  displaySettings.value = {}
  recoveryItems.value = []
  vi.clearAllMocks()
  fetchMock.mockResolvedValue([
    {
      id: 'wellness-1',
      date: '2026-10-05T00:00:00Z',
      recoveryScore: 65,
      sleepHours: 7,
      hrv: 45,
      restingHr: 52,
      weight: 70
    }
  ])
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})
describe('Fitness journey', () => {
  it('keeps the real summary visible and reveals chart settings with their topic', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('fitness-summary-cards-stub').exists()).toBe(true)
    expect(wrapper.find('[data-metric]').exists()).toBe(false)
    await openTopic(wrapper, 'Sleep')
    expect(wrapper.get('[data-metric="sleep"]').exists()).toBe(true)
    await wrapper.get('[data-metric="sleep"] button').trigger('click')
    expect(wrapper.findComponent({ name: 'FitnessChartSettingsModal' }).props('metricKey')).toBe(
      'sleep'
    )
  })
  it('keeps period queries, daily records, and customization controls working', async () => {
    const wrapper = await mountPage()
    const period = wrapper.get('select[aria-label="Fitness time range"]')
    await period.setValue('7')
    await flushPromises()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/wellness', {
      query: { startDate: '2026-09-29T00:00:00.000Z', endDate: '2026-10-06T00:00:00.000Z' }
    })
    await openTopic(wrapper, 'Daily records')
    expect(wrapper.get('[data-test="records"]').text()).toBe('1 records')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Customize fitness')!
      .trigger('click')
    expect(wrapper.findComponent({ name: 'FitnessSettingsModal' }).props('open')).toBe(true)
  })
  it('respects chart visibility preferences and true empty data', async () => {
    displaySettings.value = { sleep: { visible: false } }
    const wrapper = await mountPage()
    expect(wrapper.findAll('summary').map((entry) => entry.text())).not.toContain('Sleep')
    wrapper.unmount()
    fetchMock.mockResolvedValue([])
    const empty = await mountPage()
    expect(empty.findAll('summary').map((entry) => entry.text())).toEqual(['Daily records'])
    await openTopic(empty, 'Daily records')
    expect(empty.get('[data-test="records"]').text()).toBe('0 records')
  })
})
