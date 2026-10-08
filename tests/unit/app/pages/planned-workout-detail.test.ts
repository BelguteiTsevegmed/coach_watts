// @vitest-environment nuxt

import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import PlannedWorkoutDetailPage from '../../../../app/pages/workouts/planned/[id]/index.vue'

// Reactive stand-in for the global Trigger.dev runs list. Each test seeds this
// before mounting so we can simulate the page mounting (e.g. after a reload)
// while a structure generation/adjustment run is already in flight.
const activeRuns = ref<any[]>([])

mockNuxtImport('useRoute', () => () => ({ params: { id: 'workout-1' }, query: {} }))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))
mockNuxtImport('useFormat', () => () => ({
  formatDateUTC: (_date: unknown, formatStr?: string) => formatStr || '',
  getUserLocalDate: () => new Date('2026-07-31T00:00:00.000Z'),
  timezone: 'UTC'
}))
mockNuxtImport('usePlannedWorkoutNeighbors', () => () => ({
  previousWorkout: ref(null),
  nextWorkout: ref(null),
  neighborsPending: ref(false),
  refreshNeighbors: vi.fn()
}))
mockNuxtImport('useUserRuns', () => () => ({ refresh: vi.fn() }))
mockNuxtImport('useUserRunsState', () => () => ({
  runs: activeRuns,
  onTaskCompleted: vi.fn(),
  onTaskFailed: vi.fn()
}))
mockNuxtImport('useUpgradeModal', () => () => ({
  isOpen: ref(false),
  options: ref({}),
  show: vi.fn(),
  close: vi.fn()
}))

const WORKOUT_ID = 'workout-1'
const mountedPages: VueWrapper[] = []

function buildWorkoutResponse(overrides: Record<string, any> = {}) {
  const { workout: workoutOverrides, ...responseOverrides } = overrides
  return {
    workout: {
      id: WORKOUT_ID,
      title: 'Sweet Spot Intervals',
      type: 'Ride',
      date: '2026-07-31',
      durationSec: 3600,
      workIntensity: 0.75,
      structuredWorkout: null,
      trainingWeek: null,
      syncConflict: false,
      ...workoutOverrides
    },
    userFtp: 250,
    llmUsageId: null,
    initialFeedback: null,
    initialFeedbackText: null,
    sportSettings: {},
    settingsStaleness: null,
    structureGenerationInFlight: false,
    hasRenderableStructure: true,
    ...responseOverrides
  }
}

// The page's meaningful content (badges, buttons) lives inside the `#body`
// slot of `UDashboardPanel` / `UDashboardNavbar`. Plain `shallow: true`
// stubbing replaces those components (and their slot content) entirely, so
// we give them slot-preserving stubs while still shallow-stubbing everything
// else (Nuxt UI primitives, nested workout view components, modals, ...).
async function mountPage() {
  const wrapper = await mountSuspended(PlannedWorkoutDetailPage, {
    shallow: true,
    global: {
      // Shallow-stubbed components render nothing at all by default; this
      // makes them render their *default* slot, which is needed so
      // UButton/UBadge labels ("Build Structure", "Structure generation
      // running", ...) still show up in the rendered text.
      renderStubDefaultSlot: true,
      stubs: {
        // These two gate ALL of the page's #body content behind *named*
        // slots, which renderStubDefaultSlot does not cover, so they need
        // explicit slot-preserving templates.
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
  mountedPages.push(wrapper)

  await flushPromises()
  await nextTick()
  await nextTick()

  return wrapper
}

describe('Planned workout detail generation state restoration (CW-5)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    activeRuns.value = []
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === `/api/workouts/planned/${WORKOUT_ID}`) {
        return buildWorkoutResponse()
      }
      // Everything else (integrations status, neighbors, nutrition, ...) is
      // wrapped in try/catch on the page, so a rejection is a safe "no data".
      throw new Error(`Unhandled fetch in test: ${url}`)
    })
    // @sidebase/nuxt-auth calls `$fetch.raw` during app init to load the session;
    // give the stub a harmless implementation so that unrelated plugin doesn't
    // pollute this page-level test with unrelated console noise.
    ;(fetchMock as any).raw = vi.fn().mockResolvedValue({ _data: null })
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    mountedPages.splice(0).forEach((wrapper) => wrapper.unmount())
    vi.unstubAllGlobals()
  })

  it('restores the generating banner after mount when a structure generation run is already active', async () => {
    activeRuns.value = [
      {
        id: 'run-1',
        taskIdentifier: 'generate-structured-workout',
        status: 'EXECUTING',
        startedAt: new Date().toISOString(),
        tags: [`planned-workout:${WORKOUT_ID}`]
      }
    ]

    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('Structure generation running')
    expect(wrapper.text()).toContain('Generating...')
    expect(wrapper.text()).not.toContain('Build Structure')
  })

  it('restores the adjusting state (not generating) when the active run is an adjustment', async () => {
    activeRuns.value = [
      {
        id: 'run-2',
        taskIdentifier: 'adjust-structured-workout',
        status: 'EXECUTING',
        startedAt: new Date().toISOString(),
        tags: [`planned-workout:${WORKOUT_ID}`]
      }
    ]

    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('Structure update running')
  })

  it('does not show the generating banner when there is no active run for this workout', async () => {
    const wrapper = await mountPage()

    expect(wrapper.text()).not.toContain('Structure generation running')
    expect(wrapper.text()).toContain('Build Structure')
  })

  it('shows the persisted generation failure after a reload without a live task event', async () => {
    fetchMock.mockResolvedValueOnce(
      buildWorkoutResponse({
        latestStructureGenerationRun: {
          id: 'generation-1',
          mode: 'generate',
          status: 'FAILED',
          error: 'Final structure exceeds the weekly duration budget.'
        }
      })
    )
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Final structure exceeds the weekly duration budget.')
    expect(wrapper.text()).toContain('Build Structure')
    expect(wrapper.text()).not.toContain('Generating...')
  })

  it('shows a terminal failure returned by workout polling without a live task event', async () => {
    let poll: (() => Promise<void>) | undefined
    const originalSetInterval = globalThis.setInterval
    const intervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((callback: any, delay: any, ...args: any[]) => {
        if (delay === 3000) poll = callback
        return originalSetInterval(callback, delay, ...args)
      })
    try {
      fetchMock.mockResolvedValueOnce(buildWorkoutResponse({ structureGenerationInFlight: true }))
      const wrapper = await mountPage()
      expect(wrapper.text()).toContain('Generating...')
      fetchMock.mockResolvedValueOnce(
        buildWorkoutResponse({
          latestStructureGenerationRun: {
            id: 'generation-1',
            status: 'FAILED',
            mode: 'generate',
            error: 'Generation timed out.'
          }
        })
      )
      expect(poll).toBeDefined()
      await poll!()
      await flushPromises()
      expect(wrapper.text()).toContain('Generation timed out.')
      expect(wrapper.text()).toContain('Build Structure')
      expect(wrapper.text()).not.toContain('Generating...')
    } finally {
      intervalSpy.mockRestore()
    }
  })

  it('ignores active runs tagged for a different workout', async () => {
    activeRuns.value = [
      {
        id: 'run-3',
        taskIdentifier: 'generate-structured-workout',
        status: 'EXECUTING',
        startedAt: new Date().toISOString(),
        tags: ['planned-workout:some-other-workout']
      }
    ]

    const wrapper = await mountPage()

    expect(wrapper.text()).not.toContain('Structure generation running')
    expect(wrapper.text()).toContain('Build Structure')
  })

  it('keeps targets and generation details closed while the session purpose leads', async () => {
    fetchMock.mockResolvedValueOnce(
      buildWorkoutResponse({
        workout: {
          description: 'Build aerobic endurance while keeping the effort comfortable.',
          structuredWorkout: { steps: [{ duration: 3600, power: { value: 0.7 } }] }
        }
      })
    )
    const wrapper = await mountPage()

    expect(wrapper.find('h1').text()).toBe('Sweet Spot Intervals')
    expect(wrapper.text()).toContain(
      'Build aerobic endurance while keeping the effort comfortable.'
    )
    expect(wrapper.find('#session-plan').exists()).toBe(true)
    const targets = wrapper
      .findAll('details')
      .find((details) => details.find('summary').text() === 'Session targets')
    expect(targets).toBeDefined()
    expect(targets!.attributes('open')).toBeUndefined()
    expect(wrapper.text()).toContain('Review session')
    expect(wrapper.text()).toContain('Send to training app')
    expect(wrapper.text()).toContain('Download for device')
  })

  it('keeps publishing and device export reachable after preparation', async () => {
    fetchMock.mockResolvedValueOnce(
      buildWorkoutResponse({
        workout: { structuredWorkout: { steps: [{ duration: 3600, power: { value: 0.7 } }] } }
      })
    )
    const wrapper = await mountPage()
    const publish = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Send to training app')
    expect(publish).toBeDefined()
    await publish!.trigger('click')
    await nextTick()
    expect(wrapper.find('u-modal-stub[title="Publish to Intervals.icu"]').exists()).toBe(true)

    const download = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Download for device')
    expect(download).toBeDefined()
    await download!.trigger('click')
    await nextTick()
    expect(wrapper.find('u-modal-stub[title="Download Workout"]').exists()).toBe(true)
  })

  it('keeps the sync guard visible and disables publishing when the structure is not ready', async () => {
    fetchMock.mockResolvedValueOnce(
      buildWorkoutResponse({
        workout: { structuredWorkout: { steps: [{ duration: 3600, power: { value: 0.7 } }] } },
        structureGenerationInFlight: true
      })
    )
    const wrapper = await mountPage()
    const publish = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Send to training app')
    expect(publish).toBeDefined()
    expect((publish!.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.text()).toContain('Structure generation is still running.')
  })
})
