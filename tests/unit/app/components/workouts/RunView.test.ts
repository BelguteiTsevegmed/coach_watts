// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { computed } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RunView from '../../../../../app/components/workouts/planned/RunView.vue'

afterEach(() => vi.unstubAllGlobals())

describe('no-watch running presentation', () => {
  it('shows each numeric RPE target without fabricated threshold intensity or zones', () => {
    vi.stubGlobal('computed', computed)
    const wrapper = mount(RunView, {
      props: {
        workout: {
          type: 'Run',
          structuredWorkout: {
            steps: [
              {
                name: 'Warmup',
                type: 'Warmup',
                durationSeconds: 300,
                primaryTarget: 'rpe',
                rpe: 2
              },
              {
                name: 'Conversational run',
                type: 'Active',
                durationSeconds: 600,
                primaryTarget: 'rpe',
                rpe: 3
              },
              {
                name: 'Cooldown',
                type: 'Cooldown',
                durationSeconds: 300,
                primaryTarget: 'rpe',
                rpe: 2
              }
            ]
          }
        },
        sportSettings: { targetPolicy: { primaryMetric: 'heartRate' } }
      },
      global: {
        stubs: {
          WorkoutDetailToolsMenu: true,
          WorkoutRunChart: { template: '<div>Intensity (% LTHR) Time in Zone</div>' }
        }
      }
    })
    expect(wrapper.text()).toContain('RPE 3/10')
    expect(wrapper.text()).toContain('RPE 2/10')
    expect(wrapper.text()).not.toContain('Average intensity')
    expect(wrapper.text()).not.toContain('LTHR')
    expect(wrapper.text()).not.toContain('Time in Zone')
    wrapper.unmount()
  })
})
