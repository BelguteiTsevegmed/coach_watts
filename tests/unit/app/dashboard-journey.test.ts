// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { reactive, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TrainingRecommendationCard from '../../../app/components/dashboard/TrainingRecommendationCard.vue'

const state = vi.hoisted(() => ({ recommendation: null as any, checkin: null as any }))

vi.mock('@tolgee/vue', () => ({
  useTranslate: () => {
    const t = (key: string, params?: { load?: number }) =>
      key === 'today_session_suggestion_load' ? `load ${params?.load}` : key
    ;(t as any).value = t
    return { t }
  }
}))
mockNuxtImport('useAuth', () => () => ({
  status: ref('unauthenticated'),
  data: ref(null),
  getSession: vi.fn().mockResolvedValue(null),
  signOut: vi.fn()
}))
mockNuxtImport('useRecommendationStore', () => () => state.recommendation)
mockNuxtImport('useCheckinStore', () => () => state.checkin)
mockNuxtImport('useIntegrationStore', () => () => ({ syncAllData: vi.fn() }))
mockNuxtImport('useUserStore', () => () => ({ profile: null, generating: false }))
mockNuxtImport('useQuotaPaywall', () => () => ({
  handleLockedAction: vi.fn(async ({ onAllowed }: { onAllowed: () => Promise<unknown> }) =>
    onAllowed()
  )
}))
mockNuxtImport('useDataStatus', () => () => ({ checkProfileStale: () => ({ isStale: false }) }))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))
mockNuxtImport('useAnalytics', () => () => ({
  trackRecommendationRequest: vi.fn(),
  trackRecommendationAccept: vi.fn()
}))
mockNuxtImport('useRecoveryContext', () => () => ({ activeToday: ref([]), refresh: vi.fn() }))

const Button = {
  emits: ['click'],
  props: ['to', 'color', 'variant', 'disabled', 'loading'],
  template: `<a v-if="to" :href="to"><slot /></a><button v-else :disabled="disabled" @click="$emit('click')"><slot /></button>`
}

async function render(props = {}) {
  return mountSuspended(TrainingRecommendationCard, {
    props,
    shallow: true,
    global: { renderStubDefaultSlot: true, stubs: { UButton: Button } }
  })
}

describe('Today next action', () => {
  beforeEach(() => {
    state.recommendation = reactive({
      todayWorkouts: [{ id: 'ride', type: 'Ride', title: 'Easy endurance', durationSec: 2700 }],
      todayRecommendation: null,
      loadingWorkout: false,
      generating: false,
      generatingAdHoc: false,
      acceptRecommendation: vi.fn().mockResolvedValue(true),
      generateTodayRecommendation: vi.fn().mockResolvedValue(undefined)
    })
    state.checkin = reactive({
      isCompleted: false,
      loading: false,
      error: null,
      currentCheckin: null
    })
  })

  it('leads with check-in and exposes one primary action, with a quiet session preview', async () => {
    const wrapper = await render()
    const next = wrapper.get('.today-flow__next')
    expect(next.text()).toContain('journey_checkin_title')
    expect(next.findAll('button, a')).toHaveLength(1)
    await next.get('button').trigger('click')
    expect(wrapper.emitted('open-checkin')).toHaveLength(1)
    expect(wrapper.get('a[href="/workouts/planned/ride"]').text()).toBe('journey_preview_session')
    expect(wrapper.findAll('details').every((detail) => !detail.attributes('open'))).toBe(true)
  })

  it('changes the primary action to session preparation after a saved check-in', async () => {
    const wrapper = await render()
    state.checkin.isCompleted = true
    await wrapper.vm.$nextTick()
    const next = wrapper.get('.today-flow__next')
    expect(next.text()).toContain('Easy endurance')
    expect(next.get('a').attributes('href')).toBe('/workouts/planned/ride')
    expect(next.findAll('button, a')).toHaveLength(1)
  })

  it('takes a completed session to its real notes section', async () => {
    state.recommendation.todayWorkouts[0].completed = true
    const wrapper = await render({
      completedWorkouts: [
        {
          id: 'actual-ride',
          title: 'Morning ride',
          type: 'Ride',
          source: 'completed',
          status: 'completed',
          date: '2026-10-05',
          plannedWorkoutId: 'ride'
        }
      ]
    })
    const next = wrapper.get('.today-flow__next')
    expect(next.text()).toContain('journey_reflect_title')
    expect(next.get('a').attributes('href')).toBe('/workouts/actual-ride#notes')
  })

  it('gives an explicit rest day a useful continuation', async () => {
    state.checkin.isCompleted = true
    state.recommendation.todayWorkouts = [{ id: 'rest', type: 'Rest', title: 'Rest' }]
    const wrapper = await render()
    expect(wrapper.get('.today-flow__next').text()).toContain('journey_rest_title')
    expect(wrapper.get('.today-flow__next a').attributes('href')).toBe('/plan')
  })

  it('offers retry rather than inventing an empty or rest day after a calendar error', async () => {
    const wrapper = await render({ dayError: 'Offline' })
    const next = wrapper.get('.today-flow__next')
    expect(next.text()).toContain('journey_error_title')
    expect(next.text()).not.toContain('journey_unplanned_title')
    await next.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('keeps a proposed calendar change behind deliberate acceptance', async () => {
    state.recommendation.todayRecommendation = {
      id: 'recommendation',
      recommendation: 'modify',
      reasoning: 'An easier session may fit today.',
      analysisJson: { suggested_modifications: { description: 'Reduce the duration.' } },
      userAccepted: false
    }
    const wrapper = await render()
    expect(state.recommendation.acceptRecommendation).not.toHaveBeenCalled()
    const acceptance = wrapper
      .findAll('button')
      .find((button) => button.text() === 'training_recommendation_accept_button')!
    await acceptance.trigger('click')
    expect(state.recommendation.acceptRecommendation).toHaveBeenCalledWith('recommendation')
  })

  it('shows the session, duration and load that accepting a proposal will apply', async () => {
    state.recommendation.todayRecommendation = {
      id: 'recommendation',
      recommendation: 'modify',
      analysisJson: {
        suggested_modifications: {
          description: 'Reduce the duration.',
          new_title: 'Easy Run',
          new_type: 'Run',
          new_duration_min: 30,
          new_tss: 20
        }
      },
      userAccepted: false
    }
    const wrapper = await render()
    expect(wrapper.get('[data-testid="today-suggested-change-summary"]').text()).toBe(
      'Easy Run · 30 min · load 20'
    )
    expect(state.recommendation.acceptRecommendation).not.toHaveBeenCalled()
  })

  it('refreshes advice after the plan changes and prevents accepting the stale proposal', async () => {
    state.recommendation.todayRecommendation = {
      id: 'recommendation',
      recommendation: 'modify',
      planChanged: true,
      analysisJson: { suggested_modifications: { description: 'Reduce the duration.' } },
      userAccepted: false
    }
    const wrapper = await render()
    expect(wrapper.text()).not.toContain('training_recommendation_accept_button')
    expect(wrapper.text()).not.toContain('training_recommendation_accepted')
    await wrapper.get('[data-testid="today-plan-changed"] button').trigger('click')
    await flushPromises()
    expect(state.recommendation.generateTodayRecommendation).toHaveBeenCalledWith(undefined)
    expect(state.recommendation.acceptRecommendation).not.toHaveBeenCalled()
  })
})
