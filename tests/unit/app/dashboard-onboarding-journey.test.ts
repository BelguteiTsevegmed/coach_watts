// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import OnboardingView from '../../../app/components/dashboard/OnboardingView.vue'
import type { OnboardingStatus } from '../../../shared/onboarding-status'

vi.mock('@tolgee/vue', () => ({
  useTranslate: () => {
    const t = (key: string) => key
    ;(t as any).value = t
    return { t }
  }
}))
mockNuxtImport('useAuth', () => () => ({
  signIn: vi.fn(),
  status: ref('unauthenticated'),
  data: ref(null),
  getSession: vi.fn().mockResolvedValue(null),
  signOut: vi.fn()
}))
mockNuxtImport('useAnalytics', () => () => ({
  trackSetupHubViewed: vi.fn(),
  trackIntegrationConnectStart: vi.fn()
}))

const status: OnboardingStatus = {
  signupMethod: 'google',
  currentStep: 'connect_data',
  steps: [],
  importState: 'idle',
  connectedProviders: [],
  hasIntegration: false,
  hasAnyData: false,
  hasUsableData: false,
  hasFirstInsight: false,
  activationComplete: false,
  showFullSetupHub: true,
  showCompactSetupCard: false,
  primaryProvider: 'intervals',
  workoutCount: 0,
  wellnessCount: 0,
  nutritionCount: 0,
  importErrorMessage: null,
  hasConsent: true,
  hasPrimaryGoal: false,
  hasActivePlan: false,
  softActivated: false,
  fullyActivated: false,
  mobileActivationStep: 'goal',
  primaryGoalId: null,
  activePlanId: null
}

async function render(overrides: Partial<OnboardingStatus> = {}) {
  return mountSuspended(OnboardingView, {
    props: { status: { ...status, ...overrides } },
    shallow: true,
    global: {
      renderStubDefaultSlot: true,
      stubs: {
        UButton: {
          emits: ['click'],
          props: ['to', 'color', 'disabled'],
          template: `<a v-if="to" :href="to"><slot /></a><button v-else :disabled="disabled" @click="$emit('click')"><slot /></button>`
        }
      }
    }
  })
}

describe('New athlete setup journey', () => {
  it('starts with purpose and an actionable goal route while providers stay in a closed disclosure', async () => {
    const wrapper = await render()
    expect(wrapper.get('h1').text()).toBe('journey_setup_goal_title')
    expect(wrapper.get('a[href="/profile/goals?new=1&returnTo=/dashboard"]').text()).toBe(
      'journey_setup_goal_action'
    )
    expect(wrapper.get('.setup-journey__disclosure').attributes('open')).toBeUndefined()
    expect(wrapper.findAll('.grid')).toHaveLength(0)
  })

  it('offers a training plan after the goal exists', async () => {
    const wrapper = await render({ hasPrimaryGoal: true })
    expect(wrapper.get('h1').text()).toBe('journey_setup_plan_title')
    expect(wrapper.get('a[href="/plan?returnTo=/dashboard"]').text()).toBe(
      'journey_setup_plan_action'
    )
  })

  it('lets the athlete enter Today before connecting an app', async () => {
    const wrapper = await render({ hasPrimaryGoal: true, hasActivePlan: true })
    const button = wrapper
      .findAll('button')
      .find((item) => item.text() === 'journey_setup_ready_action')!
    await button.trigger('click')
    expect(wrapper.emitted('connect-later')).toHaveLength(1)
  })

  it('preserves the consent gate and does not offer a deferral when consent is missing', async () => {
    const wrapper = await render({ hasConsent: false })
    expect(wrapper.get('a[href="/onboarding"]').text()).toBe('journey_setup_consent_action')
    expect(wrapper.find('.setup-journey__disclosure').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('journey_setup_later')
  })

  it('shows actual import failure and a recovery action', async () => {
    const wrapper = await render({
      hasIntegration: true,
      importState: 'failed',
      importErrorMessage: 'Connection expired.'
    })
    expect(wrapper.get('.setup-journey__import').text()).toContain('Connection expired.')
    await wrapper.get('.setup-journey__import button').trigger('click')
    expect(wrapper.emitted('sync')).toHaveLength(1)
  })
})
