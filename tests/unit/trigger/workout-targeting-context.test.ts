import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  COACHING_EVIDENCE_VERSION,
  COACHING_EVIDENCE_REVIEWED_AT
} from '../../../shared/coaching-evidence'
import { buildPlannedWorkoutGenerationContext } from '../../../trigger/utils/workout-targeting'
import { normalizeTargetPolicy } from '../../../server/utils/workout-target-policy'
import { normalizeTargetFormatPolicy } from '../../../server/utils/workout-target-format-policy'

// Historical contexts remain unchanged; every newly generated/adjusted context
// identifies the reviewed policy even when no athlete metrics are available.
describe('coaching evidence provenance', () => {
  it.each(['generate', 'adjust'] as const)('records the policy for %s', (operation) => {
    const context = buildPlannedWorkoutGenerationContext({
      operation,
      workout: { id: 'workout-1', type: 'Run' },
      targetPolicy: normalizeTargetPolicy(null),
      targetFormatPolicy: normalizeTargetFormatPolicy(null),
      loadPreference: 'RPE',
      timezone: 'Europe/Warsaw',
      model: 'test',
      recentWorkoutsCount: 0
    })
    expect(context.coachingEvidenceVersion).toBe(COACHING_EVIDENCE_VERSION)
    expect(context.context.recentWorkoutsCount).toBe(0)
    expect(context.workout.durationSec).toBeNull()
  })

  it('keeps the register aligned with the version retained by generations', () => {
    const register = readFileSync(
      new URL('../../../docs/04-guides/coaching-evidence-policy.md', import.meta.url),
      'utf8'
    )
    expect(register).toContain(COACHING_EVIDENCE_VERSION)
    expect(register).toContain(COACHING_EVIDENCE_REVIEWED_AT)
  })
})
