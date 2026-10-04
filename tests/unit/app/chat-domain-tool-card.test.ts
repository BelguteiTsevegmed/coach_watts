// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatDomainToolCard from '../../../app/components/chat/ChatDomainToolCard.vue'

describe('ChatDomainToolCard', () => {
  it('treats patch_nutrition_items as a nutrition tool', () => {
    const wrapper = mount(ChatDomainToolCard, {
      props: {
        toolName: 'patch_nutrition_items',
        status: 'success',
        response: {
          message: 'Successfully updated 1 item in snacks.',
          totals: {
            calories: 500,
            protein: 25,
            carbs: 60,
            fat: 10,
            water_ml: 250
          }
        }
      },
      global: {
        stubs: {
          UBadge: {
            template: '<span><slot /></span>'
          },
          UIcon: {
            props: ['name'],
            template: '<i :data-name="name" />'
          }
        }
      }
    })

    const icon = wrapper.find('i[data-name]')

    expect(icon.attributes('data-name')).toBe('i-heroicons-cake')
    expect(wrapper.text()).toContain('Patch Nutrition Items')
    expect(wrapper.text()).toContain('Successfully updated 1 item in snacks.')
  })

  it('renders a logged injury with location, pain and status', async () => {
    const wrapper = mount(ChatDomainToolCard, {
      props: {
        toolName: 'log_injury',
        status: 'success',
        response: {
          success: true,
          message: 'Logged left achilles (pain 4/10).',
          injury: {
            id: 'inj-1',
            location: 'Left achilles',
            painLevel: 4,
            status: 'ACTIVE',
            days_since_onset: 3,
            notes: 'Sore on the first steps in the morning'
          }
        }
      },
      global: {
        stubs: {
          UBadge: {
            template: '<span><slot /></span>'
          },
          UIcon: {
            props: ['name'],
            template: '<i :data-name="name" />'
          }
        }
      }
    })

    expect(wrapper.find('i[data-name]').attributes('data-name')).toBe('i-heroicons-heart')
    expect(wrapper.text()).toContain('Logged left achilles (pain 4/10).')

    // Details (the injury item) are shown once the card is expanded.
    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('Left achilles')
    expect(wrapper.text()).toContain('Pain 4/10')
    expect(wrapper.text()).toContain('Active')
    expect(wrapper.text()).toContain('3 days')
  })
})
