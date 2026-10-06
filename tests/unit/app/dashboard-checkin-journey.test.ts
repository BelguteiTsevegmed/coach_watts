// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DailyCheckinModal from '../../../app/components/dashboard/DailyCheckinModal.vue'

const state = vi.hoisted(() => ({ refreshToday: vi.fn() }))
vi.mock('@tolgee/vue', () => ({
  useTranslate: () => {
    const t = (key: string) => key
    ;(t as any).value = t
    return { t }
  }
}))
mockNuxtImport('useAuth', () => () => ({
  status: ref('unauthenticated'),
  data: ref(null),
  getSession: vi.fn().mockResolvedValue(null)
}))
mockNuxtImport('useCheckinStore', () => () => ({ fetchToday: state.refreshToday }))
mockNuxtImport('useQuotaPaywall', () => () => ({
  showQuotaPaywall: vi.fn(),
  handleLockedAction: vi.fn()
}))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))
mockNuxtImport('useFormat', () => () => ({ formatDateUTC: () => 'Monday, Oct 5' }))
mockNuxtImport('useAnalytics', () => () => ({
  trackDailyCheckinStart: vi.fn(),
  trackDailyCheckinComplete: vi.fn()
}))
mockNuxtImport('useLoadingMessages', () => () => ({
  message: ref('Loading'),
  start: vi.fn(),
  stop: vi.fn()
}))
mockNuxtImport('useUserRuns', () => () => ({ refresh: vi.fn() }))
mockNuxtImport('useUserRunsState', () => () => ({
  onTaskCompleted: vi.fn(),
  onTaskFailed: vi.fn()
}))

const checkin = {
  id: 'today-checkin',
  date: '2026-10-05',
  status: 'COMPLETED',
  userNotes: '',
  questions: [
    { id: 'sleep', text: 'Did you sleep well?', reasoning: 'Recovery matters.' },
    { id: 'energy', text: 'Do you feel ready to train?', reasoning: 'Your energy adds context.' }
  ]
}

const fetchMock = vi.fn()
async function render() {
  const wrapper = await mountSuspended(DailyCheckinModal, {
    props: { open: true },
    shallow: true,
    global: {
      renderStubDefaultSlot: true,
      stubs: {
        UModal: {
          template: '<div><slot name="body" /><footer><slot name="footer" /></footer></div>'
        },
        UButton: {
          emits: ['click'],
          props: ['disabled', 'loading'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
        },
        UFormField: { template: '<div><slot /></div>' },
        URadioGroup: {
          props: ['modelValue', 'name', 'items'],
          emits: ['update:modelValue'],
          template: `<div><label v-for="item in items" :key="item.value"><input type="radio" :name="name" :value="item.value" :checked="modelValue === item.value" @change="$emit('update:modelValue', item.value)" />{{ item.label }}</label></div>`
        },
        UTextarea: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        }
      }
    }
  })
  await flushPromises()
  return wrapper
}

function button(wrapper: any, label: string) {
  return wrapper.findAll('button').find((item: any) => item.text() === label)!
}

describe('Check-in as a short sequence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/checkin/today') return structuredClone(checkin)
      if (url === '/api/checkin/history') return []
      if (url === '/api/checkin/answer') return { success: true }
      throw new Error(`Unexpected request ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('describes pending preparation honestly and offers a clear return-later message after 15 seconds', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/checkin/today')
        return { ...structuredClone(checkin), status: 'PENDING', questions: [] }
      if (url === '/api/checkin/history') return []
      throw new Error(`Unexpected request ${url}`)
    })
    const wrapper = await render()
    expect(wrapper.get('[role="status"]').text()).toContain('Preparing your check-in…')
    expect(wrapper.text()).not.toContain('Checking recovery metrics')
    expect(wrapper.text()).not.toContain('This is taking longer than usual.')
    await vi.advanceTimersByTimeAsync(15000)
    expect(wrapper.text()).toContain(
      'This is taking longer than usual. You can close this window and return later.'
    )
    expect(button(wrapper, 'Try loading again')).toBeDefined()
    wrapper.unmount()
  })

  it('shows one question and preserves the answer when going Back', async () => {
    const wrapper = await render()
    expect(wrapper.get('h2').text()).toBe('Did you sleep well?')
    expect(wrapper.text()).not.toContain('Do you feel ready to train?')
    await wrapper.get('input[value="YES"]').setValue()
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.get('h2').text()).toBe('Do you feel ready to train?')
    await button(wrapper, 'Back').trigger('click')
    expect((wrapper.get('input[value="YES"]').element as HTMLInputElement).checked).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/checkin/answer')).toBe(false)
  })

  it('allows clearing a selected answer and saves it as unanswered', async () => {
    const wrapper = await render()
    await wrapper.get('input[value="YES"]').setValue()
    await button(wrapper, 'Clear answer').trigger('click')
    expect((wrapper.get('input[value="YES"]').element as HTMLInputElement).checked).toBe(false)
    expect((wrapper.get('input[value="NO"]').element as HTMLInputElement).checked).toBe(false)
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('Not answered')
    await button(wrapper, 'Save check-in').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/checkin/answer', {
      method: 'POST',
      body: { checkinId: 'today-checkin', answers: {}, userNotes: '' }
    })
  })

  it('removes a generated question and excludes its earlier answer from the original save payload', async () => {
    const wrapper = await render()
    await wrapper.get('input[value="YES"]').setValue()
    await button(wrapper, 'Remove question').trigger('click')
    expect(wrapper.get('h2').text()).toBe('Do you feel ready to train?')
    await wrapper.get('input[value="NO"]').setValue()
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).not.toContain('Did you sleep well?')
    await button(wrapper, 'Save check-in').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/checkin/answer', {
      method: 'POST',
      body: { checkinId: 'today-checkin', answers: { energy: 'NO' }, userNotes: '' }
    })
  })

  it('reaches notes and review before explicitly saving the original API payload', async () => {
    const wrapper = await render()
    await wrapper.get('input[value="YES"]').setValue()
    await button(wrapper, 'Next').trigger('click')
    await wrapper.get('input[value="NO"]').setValue()
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.get('h2').text()).toBe('Anything else on your mind?')
    expect(wrapper.text()).toContain('Review your answers')
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/checkin/answer')).toBe(false)
    await wrapper.get('textarea').setValue('A shorter ride today.')
    await button(wrapper, 'Save check-in').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/checkin/answer', {
      method: 'POST',
      body: {
        checkinId: 'today-checkin',
        answers: { sleep: 'YES', energy: 'NO' },
        userNotes: 'A shorter ride today.'
      }
    })
    expect(state.refreshToday).toHaveBeenCalled()
    expect(wrapper.emitted('update:open')).toContainEqual([false])
  })

  it('allows unanswered questions without removing them or pretending they were answered', async () => {
    const wrapper = await render()
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    expect(wrapper.text()).toContain('Not answered')
    expect(wrapper.text()).toContain('Unanswered questions stay open.')
    await button(wrapper, 'Back').trigger('click')
    expect(wrapper.get('h2').text()).toBe('Do you feel ready to train?')
  })

  it('keeps notes and answers after a save error and allows retry', async () => {
    let saveCount = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/checkin/today') return structuredClone(checkin)
      if (url === '/api/checkin/history') return []
      if (url === '/api/checkin/answer' && saveCount++ === 0)
        throw new Error('Connection interrupted.')
      return { success: true }
    })
    const wrapper = await render()
    await wrapper.get('input[value="YES"]').setValue()
    await button(wrapper, 'Next').trigger('click')
    await button(wrapper, 'Next').trigger('click')
    await wrapper.get('textarea').setValue('Keep this note.')
    await button(wrapper, 'Save check-in').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Connection interrupted.')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Keep this note.')
    expect(wrapper.emitted('update:open')).toBeUndefined()
    await button(wrapper, 'Save check-in').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:open')).toContainEqual([false])
  })
})
