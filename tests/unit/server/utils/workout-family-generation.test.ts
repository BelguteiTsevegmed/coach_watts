import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../../server/utils/db'
import { generateStructuredAnalysis } from '../../../../server/utils/gemini'
import {
  buildWorkoutFamilySelectionPrompt,
  deriveFamilyEligibility,
  generateWorkoutFamily,
  workoutFamilyFallbackReason
} from '../../../../server/utils/workout-family-generation'
import { WORKOUT_FAMILY_VERSION } from '../../../../shared/workout-families'
vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    workout: { findMany: vi.fn() },
    injury: { findMany: vi.fn() }
  }
}))
vi.mock('../../../../server/utils/gemini', () => ({ generateStructuredAnalysis: vi.fn() }))
const now = new Date('2026-10-08T12:00:00Z')
const rows = Array.from({ length: 8 }, (_, n) => ({
  id: `actual-${n}`,
  type: 'Run',
  date: new Date(now.getTime() - n * 86400000),
  durationSec: 2400,
  rpe: 7,
  plannedWorkout: {
    durationSec: 2400,
    structuredWorkout: {
      workoutFamily: {
        version: WORKOUT_FAMILY_VERSION,
        accepted: { family: 'threshold', doseStep: 0 }
      }
    }
  }
}))
const workout = {
  id: 'plan-1',
  userId: 'athlete-1',
  type: 'Run',
  durationSec: 1740,
  title: '3x5 threshold',
  description: 'Controlled repeatable efforts.',
  user: { ftp: null }
}

describe('workout family generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.workout.findMany).mockResolvedValue(rows as any)
    vi.mocked(prisma.injury.findMany).mockResolvedValue([])
    vi.mocked(generateStructuredAnalysis).mockResolvedValue({ family: 'threshold', doseStep: 0 })
  })
  it('uses only recent completed sport exposure and comparable completion feedback', () => {
    expect(deriveFamilyEligibility(rows, 'run', now, false)).toMatchObject({
      recentSessionCount: 8,
      longestSessionSeconds: 2400,
      maxDoseStep: { threshold: 1 }
    })
    expect(deriveFamilyEligibility(rows, 'ride', now, false).recentSessionCount).toBe(0)
    const missingRpe = rows.map((r) => ({ ...r, rpe: null }))
    expect(deriveFamilyEligibility(missingRpe, 'run', now, false).maxDoseStep).toEqual({
      threshold: 0
    })
    expect(deriveFamilyEligibility(rows, 'run', now, true).maxDoseStep).toEqual({})
    const poor = rows.map((r) => ({ ...r, durationSec: 600, rpe: 10 }))
    expect(deriveFamilyEligibility(poor, 'run', now, false).maxDoseStep).toEqual({ threshold: 0 })
    const stale = rows.map((r) => ({ ...r, date: new Date('2026-01-01') }))
    expect(deriveFamilyEligibility(stale, 'run', now, false).recentSessionCount).toBe(0)
    const future = rows.map((r) => ({ ...r, date: new Date('2027-01-01') }))
    expect(deriveFamilyEligibility(future, 'run', now, false).recentSessionCount).toBe(0)
  })
  it('counts repeated records on one day as one exposure', () => {
    const sameDay = rows.map((r) => ({ ...r, date: now }))
    expect(deriveFamilyEligibility(sameDay, 'run', now, false).recentSessionCount).toBe(1)
    expect(deriveFamilyEligibility(sameDay, 'run', now, false).maxDoseStep).toEqual({
      threshold: 0
    })
  })
  it('does not include persona, names, language or sensor scores in numerical selection', () => {
    const eligibility = deriveFamilyEligibility(rows, 'run', now, false)
    const first = buildWorkoutFamilySelectionPrompt({
      workout: { ...workout, user: { aiPersona: 'Supportive', language: 'English' } } as any,
      eligibility
    })
    const second = buildWorkoutFamilySelectionPrompt({
      workout: { ...workout, user: { aiPersona: 'Aggressive', language: 'French' } } as any,
      eligibility
    })
    expect(first).toBe(second)
    expect(first).not.toContain('Aggressive')
  })
  it('compiles the recorded selector response with real references and exact dose provenance', async () => {
    const result = await generateWorkoutFamily({
      workout,
      sportSettings: { thresholdPace: 3.5 },
      primaryMetric: 'pace',
      operation: 'generate',
      now
    })
    expect(result.title).toContain('2 × 300s')
    expect(result.context).toMatchObject({
      version: WORKOUT_FAMILY_VERSION,
      reference: { thresholdPaceMps: 3.5 },
      selectionModel: 'flash',
      capturedAt: now.toISOString()
    })
    expect(result.context.completedSessionIds).toHaveLength(8)
    expect(generateStructuredAnalysis).toHaveBeenCalledOnce()
  })
  it('recompiles adjustments within the new calendar duration', async () => {
    const result = await generateWorkoutFamily({
      workout,
      sportSettings: {},
      primaryMetric: 'pace',
      operation: 'adjust',
      adjustments: { durationMinutes: 25 },
      now
    })
    expect(result.provenance.accepted.family).toBe('easy')
    expect(result.durationSeconds).toBe(1500)
    expect(result.title).not.toContain('3x5')
    expect(result.provenance.reference).toMatchObject({ thresholdPaceMps: null, metric: 'rpe' })
  })
  it('rejects logged sport restrictions and invalid selector outputs', async () => {
    vi.mocked(prisma.injury.findMany).mockResolvedValue([
      { bodyArea: 'KNEE', affectedSports: ['run'], status: 'ACTIVE' }
    ] as any)
    await expect(
      generateWorkoutFamily({
        workout,
        sportSettings: {},
        primaryMetric: 'rpe',
        operation: 'generate',
        now
      })
    ).rejects.toThrow('restriction')
    vi.mocked(prisma.injury.findMany).mockResolvedValue([])
    vi.mocked(generateStructuredAnalysis).mockResolvedValue({ family: 'threshold', doseStep: 99 })
    await expect(
      generateWorkoutFamily({
        workout,
        sportSettings: {},
        primaryMetric: 'rpe',
        operation: 'generate',
        now
      })
    ).rejects.toThrow()
  })
  it('preserves the legacy path for existing library/custom structures and unsupported sports', () => {
    expect(workoutFamilyFallbackReason({ type: 'Swim' })).toBe('unsupported_sport')
    expect(
      workoutFamilyFallbackReason({ type: 'Run', structuredWorkout: { steps: [] } })
    ).toContain('preserve_existing')
    expect(
      workoutFamilyFallbackReason({
        type: 'Run',
        structuredWorkout: { workoutFamily: { version: WORKOUT_FAMILY_VERSION } }
      })
    ).toBeNull()
  })
})
