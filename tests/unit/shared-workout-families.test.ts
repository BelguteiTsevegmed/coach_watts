import { describe, expect, it } from 'vitest'
import fixtures from '../fixtures/workout-families/v1.json'
import {
  compileWorkoutFamily,
  adjustFamilyDose,
  WORKOUT_FAMILY_VERSION,
  WORKOUT_FAMILIES,
  type FamilySport,
  type WorkoutFamilyId
} from '../../shared/workout-families'
import { validateStructuredWorkoutLimits } from '../../shared/structured-workout-contract'
import { validateCanonicalSemantics } from '../../shared/workout-canonical-validation'
import { summarizePlannedStimulus } from '../../server/utils/training-stimulus'
import {
  canonicalizeForProvider,
  serializeCanonicalForIntervals
} from '../../server/utils/canonical-workout-serializer'
import { hasValidRepeatBlockRecovery } from '../../server/utils/structured-workout-validation'

const input = (overrides: Partial<Parameters<typeof compileWorkoutFamily>[0]> = {}) => ({
  sport: 'run' as FamilySport,
  durationSeconds: 2400,
  selection: { family: 'threshold', doseStep: 0 },
  eligibility: {
    recentSessionCount: 12,
    longestSessionSeconds: 6000,
    hasSportRestriction: false,
    maxDoseStep: Object.fromEntries(Object.keys(WORKOUT_FAMILIES).map((family) => [family, 2])),
    eventTarget: { label: 'Established half-marathon effort', factor: 0.9 }
  },
  references: {
    ftp: 240,
    thresholdPaceMps: 3.6,
    source: 'sport_settings',
    metric: 'pace' as const
  },
  ...overrides
})
const repeat = (result: ReturnType<typeof compileWorkoutFamily>) =>
  result.structure.steps.find((s) => s.reps)

describe('versioned workout family compiler', () => {
  it.each(fixtures.cases)('$name matches the independent dose fixture and exports', (f) => {
    const result = compileWorkoutFamily(
      input({
        sport: f.sport as FamilySport,
        selection: { family: f.family, doseStep: f.doseStep },
        durationSeconds: f.durationSeconds,
        references: {
          ftp: 240,
          thresholdPaceMps: 3.6,
          source: 'sport_settings',
          metric: f.sport === 'run' ? 'pace' : 'power'
        }
      })
    )
    expect(result.provenance.version).toBe(fixtures.version)
    expect(result.provenance.qualityWorkSeconds).toBe(f.qualitySeconds)
    expect(result.provenance.dose).toEqual({
      reps: f.reps,
      workSeconds: f.workSeconds,
      recoverySeconds: f.recoverySeconds
    })
    expect(validateStructuredWorkoutLimits(result.structure)).toEqual([])
    expect(validateCanonicalSemantics(result.structure)).toEqual([])
    expect(hasValidRepeatBlockRecovery(result.structure.steps).valid).toBe(true)
    expect(canonicalizeForProvider(result.structure).workoutFamily?.version).toBe(
      WORKOUT_FAMILY_VERSION
    )
    const summary = summarizePlannedStimulus(
      { type: f.sport === 'run' ? 'Run' : 'Ride', structuredWorkout: result.structure },
      { ftp: 240, thresholdPace: 3.6 }
    )
    expect(summary.durationSeconds).toBe(f.durationSeconds)
    const exported = serializeCanonicalForIntervals({
      type: f.sport === 'run' ? 'Run' : 'Ride',
      title: result.title,
      description: result.description,
      structure: result.structure
    })
    expect(exported).toContain(`${f.reps}x`)
  })

  it('reduces repetitions with the same work, recovery and target instead of proportional scaling', () => {
    const full = compileWorkoutFamily(input())
    const short = compileWorkoutFamily(input({ durationSeconds: 1740 }))
    expect(repeat(short).reps).toBe(2)
    expect(repeat(short).steps).toEqual(repeat(full).steps)
    expect(short.provenance.qualityWorkSeconds).toBe(600)
    expect(short.title).toContain('2 × 300s')
    expect(short.description).not.toContain('3 ×')
    expect(short.durationSeconds).toBe(1740)
  })

  it('substitutes easy work if the minimum quality dose cannot fit', () => {
    const result = compileWorkoutFamily(input({ durationSeconds: 1500 }))
    expect(result.provenance.accepted.family).toBe('easy')
    expect(result.provenance.qualityWorkSeconds).toBe(0)
    expect(result.structure.steps[0].durationSeconds).toBe(600)
    expect(result.structure.steps.at(-1).durationSeconds).toBe(300)
    expect(result.title).not.toContain('Threshold')
    expect(result.description).not.toContain('3 ×')
  })

  it.each(['easy', 'endurance', 'long'] as WorkoutFamilyId[])(
    'compiles %s continuous work',
    (family) => {
      const result = compileWorkoutFamily(
        input({ selection: { family, doseStep: 0 }, durationSeconds: 5400 })
      )
      expect(result.provenance.accepted.family).toBe(family)
      expect(result.provenance.qualityWorkSeconds).toBe(0)
      expect(result.durationSeconds).toBe(5400)
    }
  )

  it('bounds long exposure using completed sport duration', () => {
    const result = compileWorkoutFamily(
      input({ selection: { family: 'long', doseStep: 0 }, durationSeconds: 7200 })
    )
    expect(result.durationSeconds).toBe(6600)
    expect(
      summarizePlannedStimulus({ type: 'Run', structuredWorkout: result.structure }).durationSeconds
    ).toBe(6600)
  })

  it('holds higher rungs without comparable completion evidence', () => {
    const base = input()
    const result = compileWorkoutFamily({
      ...base,
      selection: { family: 'threshold', doseStep: 2 },
      eligibility: { ...base.eligibility, maxDoseStep: {} }
    })
    expect(result.provenance.accepted.doseStep).toBe(0)
    expect(result.provenance.dose?.workSeconds).toBe(300)
  })

  it('uses bounded easy work for sparse history and unsupported sport/family pairs', () => {
    const base = input()
    const novice = compileWorkoutFamily({
      ...base,
      eligibility: { ...base.eligibility, recentSessionCount: 0 }
    })
    expect(novice.provenance.accepted.family).toBe('easy')
    expect(novice.durationSeconds).toBe(1800)
    const wrongSport = compileWorkoutFamily(
      input({ sport: 'ride', selection: { family: 'strides', doseStep: 0 } })
    )
    expect(wrongSport.provenance.accepted.family).toBe('easy')
    expect(wrongSport.provenance.status).toBe('adjusted')
  })

  it('keeps absent references explicit and exports executable RPE steps', () => {
    const result = compileWorkoutFamily(
      input({
        references: { ftp: null, thresholdPaceMps: null, source: 'unknown', metric: 'pace' }
      })
    )
    expect(result.provenance.reference.metric).toBe('rpe')
    expect(result.provenance.reference.thresholdPaceMps).toBeNull()
    const work = repeat(result).steps[0]
    expect(work).toMatchObject({ primaryTarget: 'rpe', rpe: 7 })
    expect(work.pace).toBeUndefined()
    expect(work.power).toBeUndefined()
    expect(
      serializeCanonicalForIntervals({
        type: 'Run',
        title: result.title,
        description: result.description,
        structure: result.structure
      })
    ).toContain('RPE')
  })

  it('changes intensity independently of the dose', () => {
    const baseline = compileWorkoutFamily(input())
    const adjusted = compileWorkoutFamily(
      input({ selection: { family: 'threshold', doseStep: 0, intensityFactor: 0.96 } })
    )
    expect(adjusted.provenance.dose).toEqual(baseline.provenance.dose)
    expect(repeat(adjusted).steps[0].pace.rangeMps.min).not.toBe(
      repeat(baseline).steps[0].pace.rangeMps.min
    )
    expect(repeat(adjusted).steps[0].pace.rangeMps.min).toBeCloseTo(3.6 * 0.96)
  })

  it('does not silently accept a precise intensity change without a reference', () => {
    const result = compileWorkoutFamily(
      input({
        selection: { family: 'threshold', doseStep: 0, intensityFactor: 1.01 },
        references: { ftp: null, thresholdPaceMps: null, source: 'unknown', metric: 'pace' }
      })
    )
    expect(result.provenance.accepted.intensityFactor).toBeUndefined()
    expect(result.provenance.effectiveIntensityFactor).toBeNull()
    expect(repeat(result).steps[0].rpe).toBe(7)
    expect(result.provenance.adjustments.join(' ')).toContain('effort-only')
  })

  it('is deterministic without mutating the input', () => {
    const source = input()
    const before = JSON.stringify(source)
    expect(compileWorkoutFamily(source)).toEqual(compileWorkoutFamily(source))
    expect(JSON.stringify(source)).toBe(before)
  })

  it('requires an explicit event effort', () => {
    const base = input({ selection: { family: 'race_specific', doseStep: 0 } })
    const result = compileWorkoutFamily({
      ...base,
      eligibility: { ...base.eligibility, eventTarget: undefined }
    })
    expect(result.provenance.accepted.family).toBe('easy')
  })

  it('blocks sport restrictions, invalid durations and intensity outside the family', () => {
    const base = input()
    expect(() =>
      compileWorkoutFamily({
        ...base,
        eligibility: { ...base.eligibility, hasSportRestriction: true }
      })
    ).toThrow('restriction')
    for (const durationSeconds of [NaN, Infinity, -1, 899])
      expect(() => compileWorkoutFamily(input({ durationSeconds }))).toThrow('available time')
    expect(() =>
      compileWorkoutFamily(
        input({ selection: { family: 'threshold', doseStep: 0, intensityFactor: 1.2 } })
      )
    ).toThrow('outside')
    expect(() =>
      compileWorkoutFamily(
        input({ selection: { family: 'strides', doseStep: 0, intensityFactor: 1 } })
      )
    ).toThrow('effort cues')
    expect(() =>
      compileWorkoutFamily(input({ selection: { family: 'unknown', doseStep: 0 } }))
    ).toThrow()
  })

  it('progresses only with usable feedback and keeps intensity independent', () => {
    const selection = { family: 'threshold' as const, doseStep: 1, intensityFactor: 0.98 }
    const feedback = { completed: true, effortAsExpected: true, recovered: true, symptoms: false }
    expect(adjustFamilyDose(selection, 'progress', feedback)).toEqual({ ...selection, doseStep: 2 })
    expect(adjustFamilyDose(selection, 'regress', feedback)).toEqual({ ...selection, doseStep: 0 })
    for (const changes of [
      { completed: false },
      { effortAsExpected: false },
      { recovered: false },
      { symptoms: true }
    ])
      expect(adjustFamilyDose(selection, 'progress', { ...feedback, ...changes })).toEqual(
        selection
      )
  })
})
