// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GoalsPage from '../../../app/pages/profile/goals.vue'

const route = { query: {} as Record<string, string> }
const push = vi.fn().mockResolvedValue(undefined)
const refresh = vi.fn().mockResolvedValue(undefined)
mockNuxtImport('useRoute', () => () => route)
mockNuxtImport('useRouter', () => () => ({
  push,
  replace: vi.fn().mockResolvedValue(undefined),
  afterEach: vi.fn(),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn()
}))
mockNuxtImport('useAuth', () => () => ({
  status: ref('unauthenticated'),
  data: ref(null),
  getSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn()
}))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))
mockNuxtImport('useUserRuns', () => () => ({ refresh: vi.fn() }))
mockNuxtImport('useUserRunsState', () => () => ({
  onTaskCompleted: vi.fn(),
  onTaskFailed: vi.fn()
}))
mockNuxtImport(
  'useFetch',
  () => () => Promise.resolve({ data: ref({ goals: [] }), pending: ref(false), refresh })
)

async function render() {
  return mountSuspended(GoalsPage, {
    shallow: true,
    global: {
      renderStubDefaultSlot: true,
      stubs: {
        UDashboardPanel: { template: '<div><slot name="header" /><slot name="body" /></div>' },
        UDashboardNavbar: { template: '<div><slot name="right" /></div>' },
        EventGoalWizard: {
          name: 'EventGoalWizard',
          emits: ['created', 'close'],
          template: '<div />'
        }
      }
    }
  })
}

describe('Goal setup continuity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = { new: '1', returnTo: '/dashboard' }
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns to Today once after the wizard emits created and close together', async () => {
    const wrapper = await render()
    const wizard = wrapper.findComponent({ name: 'EventGoalWizard' })
    wizard.vm.$emit('created')
    wizard.vm.$emit('close')
    expect(refresh).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledExactlyOnceWith('/dashboard')
    wrapper.unmount()
  })

  it('keeps cancellation in goals and leaves the setup destination for successful saves', async () => {
    const wrapper = await render()
    wrapper.findComponent({ name: 'EventGoalWizard' }).vm.$emit('close')
    expect(push).toHaveBeenCalledExactlyOnceWith({ query: {} })
    expect(refresh).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('rejects an external return destination', async () => {
    route.query.returnTo = 'https://outside.example/path'
    const wrapper = await render()
    wrapper.findComponent({ name: 'EventGoalWizard' }).vm.$emit('created')
    expect(push).toHaveBeenCalledExactlyOnceWith('/dashboard')
    wrapper.unmount()
  })
})
