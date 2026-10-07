import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EffortWorkoutSteps from '../../../../app/components/workouts/planned/EffortWorkoutSteps.vue'

it('renders repeated effort steps, talk cues, unavailable stress, and calibration guidance', async () => {
  const html = await renderToString(
    createSSRApp(EffortWorkoutSteps, {
      structure: {
        steps: [
          {
            reps: 3,
            steps: [
              {
                name: 'Controlled effort',
                durationSeconds: 300,
                rpe: 6,
                description: 'Speak in short phrases.'
              }
            ]
          }
        ],
        metricEstimates: { stress: 'unavailable' },
        physiology: {
          calibrationOptions: [
            {
              id: 'run',
              description: 'Enter a recent running benchmark.',
              requires: 'Reliable speed and HR evidence.'
            }
          ]
        }
      }
    })
  )
  expect(html).toContain('3 × 5 min, RPE 6/10')
  expect(html).toContain('Speak in short phrases.')
  expect(html).toContain('Training stress is unavailable')
  expect(html).toContain('Enter a recent running benchmark.')
})
