// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ActiveFuelingFeed from '../../../app/components/nutrition/ActiveFuelingFeed.vue'
import FuelStateHeader from '../../../app/components/nutrition/FuelStateHeader.vue'
import FoodItemModal from '../../../app/components/nutrition/FoodItemModal.vue'
import nutritionCopy from '../../../app/i18n/en/nutrition.json'

vi.mock('@tolgee/vue', () => ({
  useTranslate: () => {
    const t = (key: string, params: Record<string, unknown> = {}) => {
      const message = (nutritionCopy as Record<string, string>)[key] ?? key
      return message.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
    }
    ;(t as any).value = t
    return { t }
  }
}))
mockNuxtImport('useAuth', () => () => ({
  status: ref('unauthenticated'),
  data: ref(null),
  getSession: vi.fn().mockResolvedValue(null)
}))
mockNuxtImport('useFormat', () => () => ({
  getUserLocalDate: () => new Date('2026-10-05T00:00:00Z'),
  getUserLocalTime: () => new Date('2026-10-05T12:00:00Z'),
  formatDateUTC: () => '2026-10-05',
  formatDate: (_date: unknown, format: string) => (format === 'yyyy-MM-dd' ? '2026-10-05' : '12:00')
}))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

const Button = {
  props: ['to', 'color', 'variant'],
  emits: ['click'],
  template: `<a v-if="to" :href="to" :data-color="color || 'primary'" :data-variant="variant || 'solid'"><slot /></a><button v-else :data-color="color || 'primary'" :data-variant="variant || 'solid'" @click="$emit('click')"><slot /></button>`
}
const window = {
  type: 'PRE_WORKOUT',
  windowKey: 'pre:ride',
  workoutTitle: 'Easy ride',
  startTime: '2026-10-05T12:00:00Z',
  endTime: '2026-10-05T13:00:00Z',
  targetCarbs: 40,
  requiredCarbs: 30
}
const suggestion = {
  carbs: 30,
  basedOnWindowType: 'PRE_WORKOUT',
  windowKey: 'pre:ride',
  timing: 'Before your ride'
}

async function renderFeed(feed: any = null, extra = {}) {
  return mountSuspended(ActiveFuelingFeed, {
    props: { feed, loading: false, ...extra },
    shallow: true,
    global: { renderStubDefaultSlot: true, stubs: { UButton: Button } }
  })
}

describe('Nutrition daily next step', () => {
  it('uses missing data as an invitation to the real journal without claiming completion', async () => {
    const wrapper = await renderFeed()
    expect(wrapper.text()).toContain('Start with your food journal.')
    expect(wrapper.text()).not.toContain('All windows complete')
    expect(wrapper.get('a').attributes('href')).toBe('/nutrition/2026-10-05')
  })

  it('offers one primary meal choice and preserves the recommendation window context', async () => {
    const wrapper = await renderFeed({ nextWindow: window, suggestedIntake: suggestion })
    const primary = wrapper.findAll('[data-color="primary"][data-variant="solid"]')
    expect(primary).toHaveLength(1)
    expect(primary[0].text()).toBe('Choose a meal')
    await primary[0].trigger('click')
    expect(wrapper.emitted('open-ai-helper')).toEqual([[suggestion]])
    expect(
      wrapper.findAll('details').every((details) => details.attributes('open') === undefined)
    ).toBe(true)
  })

  it('takes a planned meal to its date journal and keeps editing available in details', async () => {
    const nextWindow = {
      ...window,
      lockedMeal: { title: 'Oats and yogurt', totals: { carbs: 40 }, ingredients: [] }
    }
    const wrapper = await renderFeed({ nextWindow })
    expect(wrapper.get('a').text()).toBe('View planned meal')
    expect(wrapper.get('a').attributes('href')).toBe('/nutrition/2026-10-05')
    const edit = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Change planned meal')!
    await edit.trigger('click')
    expect(wrapper.emitted('open-ai-helper')).toEqual([[nextWindow]])
  })

  it('does not prescribe more carbohydrate when the remaining window is optional timing support', async () => {
    const wrapper = await renderFeed({
      nextWindow: { ...window, timingOnly: true },
      suggestedIntake: suggestion,
      dailyCarbStatus: { actual: 100, target: 100, reached: true }
    })
    expect(wrapper.text()).toContain('optional timing support')
    expect(wrapper.text()).not.toContain('Choose a meal')
    expect(wrapper.get('a').text()).toBe('Log food')
  })

  it('lets a failed feed retry while retaining journal access', async () => {
    const wrapper = await renderFeed(null, { error: 'Connection interrupted.' })
    expect(wrapper.get('[role="alert"]').text()).toBe('Connection interrupted.')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.get('a').attributes('href')).toBe('/nutrition/2026-10-05')
  })
})

describe('Nutrition depth stays honest and accessible', () => {
  it('keeps zero intake as real data while missing goals remain unset and macro detail is keyboard-accessible', async () => {
    const wrapper = await mountSuspended(FuelStateHeader, {
      props: {
        fuelState: 1,
        settings: {},
        weight: 75,
        actuals: { calories: 0, carbs: 10, protein: 0, fat: 0 },
        targets: { calories: 0, carbs: 100, protein: 0, fat: 0 },
        hideBanner: true
      },
      shallow: true
    })
    expect(wrapper.findAll('button')).toHaveLength(4)
    expect(wrapper.text()).toContain('No target set')
    expect(wrapper.text()).toContain('10g')
    expect(wrapper.text()).not.toContain('2500')
    expect(wrapper.text()).not.toContain('Infinity')
  })

  it('leaves food facts and absorption editable on request rather than leading the logging form', async () => {
    const wrapper = await mountSuspended(FoodItemModal, {
      props: { open: true, date: '2026-10-05', mode: 'add' },
      shallow: true,
      global: {
        renderStubDefaultSlot: true,
        stubs: {
          UModal: {
            template: '<div><slot name="header" /><slot name="body" /><slot name="footer" /></div>'
          },
          UButton: Button
        }
      }
    })
    expect(wrapper.get('details').get('summary').text()).toBe('Nutrition facts and timing')
    expect(wrapper.get('details').attributes('open')).toBeUndefined()
    expect(wrapper.text()).toContain('Search foods')
  })
})
