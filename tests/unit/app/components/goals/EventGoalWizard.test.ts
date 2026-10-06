// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventGoalWizard from '../../../../../app/components/goals/EventGoalWizard.vue'

const fetchMock = vi.fn()

vi.mock('../../../../../app/composables/useFormat', () => ({
  useFormat: () => ({
    formatDate: (date: string) => date,
    formatDateUTC: (date: string) => date.slice(0, 10),
    getUserDateFromLocal: (date: string) => new Date(`${date}T00:00:00.000Z`),
    getUserLocalDate: () => new Date('2026-08-10T00:00:00.000Z')
  })
}))

function mountWizard(goalDistance: number) {
  return mount(EventGoalWizard, {
    props: {
      goal: {
        id: 'goal-1',
        type: 'EVENT',
        title: 'Autumn Fondo',
        distance: goalDistance,
        events: [{ id: 'event-1' }]
      }
    },
    global: {
      stubs: {
        UButton: { template: '<button><slot /></button>' },
        UIcon: { template: '<i />' },
        UFormField: { template: '<div><slot name="label" /><slot /><slot name="help" /></div>' },
        UInput: { template: '<input />' },
        UInputNumber: { template: '<input />' },
        USelect: { template: '<select />' },
        UTextarea: { template: '<textarea />' }
      }
    }
  })
}

describe('EventGoalWizard', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue([
      {
        id: 'event-1',
        title: 'Autumn Fondo',
        date: '2026-10-15T00:00:00.000Z',
        distance: null,
        elevation: null
      }
    ])
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('uses the saved goal distance when the linked event has no distance', async () => {
    const wrapper = mountWizard(42.2)

    await flushPromises()

    expect(wrapper.text()).toContain('42.2 km')
  })

  it('renders a zero saved distance instead of N/A', async () => {
    const wrapper = mountWizard(0)

    await flushPromises()

    expect(wrapper.text()).toContain('0 km')
  })

  it('keeps a failed save open, shows the reason, and allows a successful retry', async () => {
    const wrapper = mountWizard(42.2)
    await flushPromises()
    const update = wrapper.findAll('button').find((button) => button.text() === 'Update Goal')!
    fetchMock.mockRejectedValueOnce({ data: { message: 'Please try again shortly.' } })
    await update.trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Please try again shortly.')
    expect(wrapper.emitted('updated')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
    fetchMock.mockResolvedValueOnce({ id: 'goal-1' })
    await update.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.emitted('updated')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
