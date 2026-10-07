import { describe, expect, it } from 'vitest'
import { planAdaptationToast } from '../../../app/utils/plan-adaptation-result'

describe('dashboard recalculation outcomes', () => {
  it('shows success only for an accepted replacement', () => {
    expect(
      planAdaptationToast({ success: true, outcome: 'changed', message: 'Replaced future days' })
    ).toEqual({ title: 'Plan Recalculated', color: 'success', description: 'Replaced future days' })
  })
  it('distinguishes unchanged from failed', () => {
    expect(
      planAdaptationToast({ success: true, outcome: 'unchanged', message: 'No active week' })
    ).toMatchObject({ color: 'info', title: 'Plan Unchanged' })
    expect(
      planAdaptationToast({ success: false, outcome: 'failed', message: 'Validation failed' })
    ).toMatchObject({ color: 'error', description: 'Validation failed' })
  })
  it.each([undefined, null, { success: true }, { success: false, outcome: 'changed' }])(
    'does not display success for an absent or unvalidated output (%j)',
    (output) => {
      expect(planAdaptationToast(output).color).toBe('error')
    }
  )
})
