// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatMessageList from '../../../app/components/chat/ChatMessageList.vue'
import ChatInput from '../../../app/components/chat/ChatInput.vue'

function makeTranslateStub() {
  const t = (key: string) => key
  ;(t as any).value = t
  return t
}
vi.mock('@tolgee/vue', () => ({ useTranslate: () => ({ t: makeTranslateStub() }) }))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

const wrappers: VueWrapper[] = []
const fetchMock = vi.fn()
const baseStubs = {
  UIcon: true,
  SettingsAiVoiceSettingsModal: true,
  ChatMessageContent: {
    props: ['message'],
    emits: ['tool-approval'],
    template:
      '<div>{{ message.content }}<button data-test="approve" @click="$emit(\'tool-approval\', { approvalId: \'approval-1\', approved: true })">Approve</button></div>'
  },
  UChatMessages: {
    props: ['messages'],
    template:
      '<div><article v-for="message in messages" :key="message.id"><slot name="content" :message="message"/><slot name="actions" :message="message"/></article></div>'
  },
  UDropdownMenu: {
    props: ['items'],
    template:
      '<div><slot/><template v-for="(group, index) in items" :key="index"><button v-for="item in group" :key="item.label" :disabled="item.disabled" @click="item.onSelect?.()">{{ item.label }}</button></template></div>'
  }
}

async function mountMessages(props: Record<string, any> = {}) {
  const wrapper = await mountSuspended(ChatMessageList, {
    props: { messages: [], status: 'ready', loading: false, ...props },
    global: { stubs: baseStubs }
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

const findButton = (wrapper: VueWrapper, text: string) => {
  const button = wrapper.findAll('button').find((entry) => entry.text() === text)
  expect(button, `Expected button ${text}`).toBeDefined()
  return button!
}

beforeEach(() => {
  fetchMock.mockResolvedValue({})
  vi.stubGlobal('$fetch', fetchMock)
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Coach conversation journey', () => {
  it('retains editing and memory actions for a message with text parts', async () => {
    const message = {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'My legs felt heavy.' }]
    }
    const wrapper = await mountMessages({ messages: [message], canEditMessages: true })

    expect(wrapper.find('button[aria-label="message_options"]').exists()).toBe(true)
    await findButton(wrapper, 'Edit message').trigger('click')
    expect(wrapper.emitted('edit-message')?.[0]).toEqual([message])
    await findButton(wrapper, 'Remember this message').trigger('click')
    expect(wrapper.emitted('remember-message')?.[0]).toEqual([
      { message, text: 'My legs felt heavy.' }
    ])
    await findButton(wrapper, 'Forget this message').trigger('click')
    expect(wrapper.emitted('forget-message')?.[0]).toEqual([
      { message, text: 'My legs felt heavy.' }
    ])
  })

  it('keeps approval and interrupted-turn recovery accessible inline', async () => {
    const wrapper = await mountMessages({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Let’s adjust tomorrow.',
          parts: [{ type: 'text', text: 'Let’s adjust tomorrow.' }],
          metadata: {
            turnStatus: 'INTERRUPTED',
            turnId: 'turn-1',
            turnFailureReason: 'Connection interrupted'
          }
        }
      ]
    })

    await wrapper.get('[data-test="approve"]').trigger('click')
    expect(wrapper.emitted('tool-approval')?.[0]).toEqual([
      { approvalId: 'approval-1', approved: true }
    ])
    await findButton(wrapper, 'Resume').trigger('click')
    await findButton(wrapper, 'Retry').trigger('click')
    expect(wrapper.emitted('resume-turn')?.[0]).toEqual(['turn-1'])
    expect(wrapper.emitted('retry-turn')?.[0]).toEqual(['turn-1'])
    expect(wrapper.text()).toContain('Connection interrupted')
  })

  it('offers a retry for failed history loading and optional guidance in a new chat', async () => {
    const wrapper = await mountMessages({ loadError: 'Could not reach the server' })
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not reach the server')
    await findButton(wrapper, 'message_retry').trigger('click')
    expect(wrapper.emitted('retry-load')).toHaveLength(1)
    await wrapper.setProps({ loadError: null })
    expect(wrapper.text()).toContain('welcome_title')
    expect(wrapper.get('details').attributes('open')).toBeUndefined()
  })

  it('forwards a starter prompt from the welcome screen to the conversation', async () => {
    const wrapper = await mountMessages()
    await wrapper.get('[data-testid="chat-starter-niggle"]').trigger('click')
    expect(wrapper.emitted('starter-prompt')?.[0]).toEqual(['welcome_starter_niggle_message'])
    expect(wrapper.get('details').attributes('open')).toBeUndefined()
  })

  it('provides a working send button for a follow-up while a reply is streaming', async () => {
    const wrapper = await mountSuspended(ChatInput, {
      props: { modelValue: 'Make it an easy ride.', status: 'streaming', hasActiveTurn: true },
      global: { stubs: { UIcon: true } }
    })
    wrappers.push(wrapper)
    const button = wrapper.get('button[aria-label="input_queue"]')
    expect(button.attributes('type')).toBe('submit')
    expect(button.attributes('disabled')).toBeUndefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      text: 'Make it an easy ride.',
      attachments: []
    })
  })

  it('keeps a read-only conversation composer disabled', async () => {
    const wrapper = await mountSuspended(ChatInput, {
      props: { modelValue: 'Change this session', status: 'ready', disabled: true },
      global: { stubs: { UIcon: true } }
    })
    wrappers.push(wrapper)
    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})

// DashboardPanel is a fragment component; viewport sizing must use its native parent.
describe('Coach viewport in the shared shell', () => {
  it('sizes the composer area around the real panel and a shrinking visual viewport', async () => {
    const { defineComponent } = await import('vue')
    const { default: UDashboardGroup } = await import('@nuxt/ui/components/DashboardGroup.vue')
    const { default: UDashboardPanel } = await import('@nuxt/ui/components/DashboardPanel.vue')
    const { default: ChatViewport } = await import('../../../app/components/chat/ChatViewport.vue')
    const viewport = Object.assign(new EventTarget(), { height: 900, offsetTop: 0 })
    const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 900,
      left: 0,
      right: 400,
      width: 400,
      height: 800,
      x: 0,
      y: 100,
      toJSON: () => ({})
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800)
    try {
      const host = defineComponent({
        components: { UDashboardGroup, UDashboardPanel, ChatViewport },
        template:
          '<UDashboardGroup><ChatViewport><UDashboardPanel id="viewport-test"><template #body>Conversation</template></UDashboardPanel></ChatViewport></UDashboardGroup>'
      })
      const wrapper = await mountSuspended(host)
      wrappers.push(wrapper)
      await flushPromises()
      const viewportWrapper = wrapper.findComponent(ChatViewport)
      expect(viewportWrapper.element).toBeInstanceOf(HTMLElement)
      expect((viewportWrapper.element as HTMLElement).style.height).toBe('800px')
      expect(wrapper.text()).toContain('Conversation')
      viewport.height = 500
      viewport.dispatchEvent(new Event('resize'))
      await flushPromises()
      expect((viewportWrapper.element as HTMLElement).style.height).toBe('400px')
    } finally {
      wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
      if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport)
      else Reflect.deleteProperty(window, 'visualViewport')
    }
  })
})
