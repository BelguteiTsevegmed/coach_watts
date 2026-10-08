// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { describe, expect, it } from 'vitest'
import ZoneEditor from '../../../../../app/components/profile/ZoneEditor.vue'

const mountEditor = (zones: any[]) =>
  mount(ZoneEditor, {
    props: { modelValue: zones, title: 'Power Zones', units: 'W', icon: 'i-lucide-zap' },
    global: {
      stubs: {
        draggable: {
          props: ['modelValue'],
          render(this: any) {
            return h(
              'div',
              this.modelValue.map((element: any, index: number) =>
                this.$slots.item({ element, index })
              )
            )
          }
        },
        UIcon: true,
        UInput: true,
        UButton: true,
        USelect: {
          props: ['modelValue', 'items'],
          emits: ['update:modelValue'],
          template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>`
        }
      }
    }
  })

describe('zone physiological domains', () => {
  it('leaves vendor zone numbers unclassified and emits an explicit mapping without mutating input', async () => {
    const zones = [{ name: 'Vendor Z2', min: 140, max: 190 }]
    const wrapper = mountEditor(zones)
    expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('unknown')
    await wrapper.find('select').setValue('easy')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([
      { ...zones[0], domain: 'easy' }
    ])
    expect(zones[0]).not.toHaveProperty('domain')
  })
  it('supports removing a mapping when physiological thresholds are uncertain', async () => {
    const wrapper = mountEditor([{ name: 'Z2', min: 140, max: 190, domain: 'moderate' }])
    await wrapper.find('select').setValue('unknown')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([
      { name: 'Z2', min: 140, max: 190 }
    ])
  })
})
