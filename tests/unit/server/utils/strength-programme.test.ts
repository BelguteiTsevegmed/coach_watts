import { describe, expect, it, vi } from 'vitest'
import {
  buildStrengthProgramme,
  formatStrengthProgramme,
  loadStrengthProgramme,
  normalizeStrengthPlanTss,
  validateStrengthProgramme
} from '../../../../server/utils/strength-programme'

import { normalizeStructuredStrengthWorkout } from '../../../../server/utils/strength-exercise-library'
import {
  computeStrengthExerciseMetrics,
  hasRenderableStructure
} from '../../../../server/utils/structured-workout-persistence'
import { summarizePlannedStimulus } from '../../../../server/utils/training-stimulus'

const today = new Date('2026-10-08T00:00:00Z')
const session = (date: string, rpe: number | null = 7) => ({
  id: date,
  date: new Date(date),
  type: 'WeightTraining',
  durationSec: 1800,
  rpe
})
const established = [
  '2026-09-09',
  '2026-09-13',
  '2026-09-17',
  '2026-09-21',
  '2026-09-25',
  '2026-10-02'
].map((d) => session(d))
const native = (sets = 2, intent = 'muscular_endurance') => ({
  sRPE_target: 6,
  blocks: [
    {
      type: 'single_exercise',
      steps: [
        {
          name: 'Squat',
          intent,
          prescriptionMode: 'reps',
          defaultRest: '90s',
          notes: 'RIR 4-5; stop if form deteriorates',
          setRows: Array.from({ length: sets }, () => ({ value: '8', loadValue: '' }))
        }
      ]
    }
  ]
})

describe('endurance strength programme policy', () => {
  it('starts unknown/novice exposure with foundation and usable effort instead of a fabricated 1RM', () => {
    const programme = buildStrengthProgramme({ today, sessions: [] })
    expect(programme).toMatchObject({
      phase: 'foundation',
      maxSetsPerExercise: 2,
      targetRir: 4,
      allowLoadIncrease: false
    })
    const prompt = formatStrengthProgramme(programme)
    expect(prompt).toContain('equipment is unknown')
    expect(prompt).toContain('bodyweight')
    expect(prompt).toContain('Do not infer lifting skill')
    expect(prompt).toContain('injury prevention')
    expect(validateStrengthProgramme(native(), programme).valid).toBe(true)
    expect(validateStrengthProgramme(native(5, 'max_strength'), programme).valid).toBe(false)
  })

  it('recognizes sustained completed exposure without automatically increasing loads', () => {
    const programme = buildStrengthProgramme({ today, sessions: established })
    expect(programme).toMatchObject({
      phase: 'progressive',
      maxSetsPerExercise: 3,
      targetRir: 3,
      allowLoadIncrease: false
    })
    expect(programme.contributingSessionIds).toHaveLength(6)
    expect(formatStrengthProgramme(programme)).toContain('form')
    expect(formatStrengthProgramme(programme)).toContain('same-day')
    expect(formatStrengthProgramme(programme)).toContain('24-48')
  })

  it('holds or regresses after high effort and open injury context', () => {
    expect(
      buildStrengthProgramme({ today, sessions: [...established, session('2026-10-07', 10)] })
    ).toMatchObject({ phase: 'maintenance', allowLoadIncrease: false })
    const modified = buildStrengthProgramme({ today, sessions: established, hasOpenInjury: true })
    expect(modified.phase).toBe('modified')
    expect(formatStrengthProgramme(modified)).toContain('clinician restrictions')
    expect(validateStrengthProgramme(native(3, 'max_strength'), modified).valid).toBe(false)
  })

  it('uses race proximity and recovery phases to reduce strength volume', () => {
    const taper = buildStrengthProgramme({
      today,
      sessions: established,
      eventDates: [new Date('2026-10-15')]
    })
    expect(taper).toMatchObject({ phase: 'taper', maxSetsPerExercise: 1, targetRir: 4 })
    expect(validateStrengthProgramme(native(2), taper).valid).toBe(false)
    expect(
      buildStrengthProgramme({ today, sessions: established, planPhase: 'RECOVERY' }).phase
    ).toBe('maintenance')
    expect(
      buildStrengthProgramme({ today, sessions: established, eventDates: [new Date('2026-10-01')] })
        .phase
    ).toBe('progressive')
  })

  it('rebuilds after a break and ignores future, duplicate, and endurance activities', () => {
    expect(buildStrengthProgramme({ today, sessions: established.slice(0, -2) }).phase).toBe(
      'return'
    )
    const noisy = [
      ...established,
      ...established,
      session('2026-10-15'),
      { ...session('2026-10-07'), type: 'Run' }
    ]
    expect(buildStrengthProgramme({ today, sessions: noisy }).contributingSessionIds).toHaveLength(
      6
    )
  })

  it('rejects unqualified power work, missing effort/rest and invented unreferenced loads', () => {
    const programme = buildStrengthProgramme({ today, sessions: established })
    expect(validateStrengthProgramme(native(2, 'power'), programme).valid).toBe(false)
    const structure = native()
    structure.blocks[0]!.steps[0]!.defaultRest = ''
    expect(validateStrengthProgramme(structure, programme).valid).toBe(false)
    structure.blocks[0]!.steps[0]!.defaultRest = '90s'
    structure.blocks[0]!.steps[0]!.setRows[0]!.loadValue = '100'
    expect(validateStrengthProgramme(structure, programme).valid).toBe(false)
    structure.blocks[0]!.steps[0]!.setRows[0]!.loadValue = ''
    structure.sRPE_target = 10
    expect(validateStrengthProgramme(structure, programme).valid).toBe(false)
  })

  it('keeps limited-equipment native bodyweight work renderable and separate from endurance TSS', () => {
    const structure = normalizeStructuredStrengthWorkout(native())
    expect(hasRenderableStructure(structure)).toBe(true)
    const metrics = computeStrengthExerciseMetrics(
      structure.blocks.flatMap((block: any) => block.steps)
    )
    expect(metrics.durationSec).toBeGreaterThan(0)
    const stimulus = summarizePlannedStimulus({ type: 'Gym', structuredWorkout: structure })
    expect(stimulus.strength.sets).toBe(2)
    expect(stimulus.strength.repetitions).toBe(16)
    expect(stimulus.tss.value).toBeNull()
    const plan = {
      days: [
        { workoutType: 'Run', targetTSS: 50 },
        { workoutType: 'Gym', targetTSS: 20 }
      ],
      totalTSS: 70
    }
    expect(normalizeStrengthPlanTss(plan)).toMatchObject({
      totalTSS: 50,
      days: [{ targetTSS: 50 }, { targetTSS: 0 }]
    })
    expect(plan.totalTSS).toBe(70)
  })

  it('rejects near-maximal and excessive known loads even when the native contract is valid', () => {
    const programme = buildStrengthProgramme({ today, sessions: established })
    const structure = native()
    const step = structure.blocks[0]!.steps[0]!
    step.notes = 'RIR 0'
    expect(validateStrengthProgramme(structure, programme).valid).toBe(false)
    step.notes = 'RPE 5-10'
    expect(validateStrengthProgramme(structure, programme).valid).toBe(false)
    step.notes = 'RIR 3'
    step.setRows[0]!.loadValue = '200'
    Object.assign(step, { loadMode: 'weight_kg' })
    const reference = {
      exerciseName: 'Squat',
      e1rmKg: { minKg: 60, maxKg: 65 },
      sampleCount: 3,
      latestRpe: 7,
      estimatedRir: 3,
      progressionAdjustment: 0
    }
    expect(validateStrengthProgramme(structure, programme, [reference]).valid).toBe(false)
    step.setRows[0]!.loadValue = '40'
    expect(validateStrengthProgramme(structure, programme, [reference]).valid).toBe(true)
  })

  it('loads bounded, nonduplicate history before prescription and falls back conservatively on query failure', async () => {
    const client = { workout: { findMany: vi.fn().mockResolvedValue(established) } }
    expect((await loadStrengthProgramme(client, 'user', { today })).phase).toBe('progressive')
    expect(client.workout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user',
          isDuplicate: false,
          date: expect.objectContaining({ lt: today })
        }),
        take: 60
      })
    )
    client.workout.findMany.mockRejectedValueOnce(new Error('unavailable'))
    expect((await loadStrengthProgramme(client, 'user', { today })).phase).toBe('foundation')
  })
})
