import { describe, expect, it } from 'vitest'
import {
  applyStrengthIntensityTargets,
  buildStrengthIntensityReferences,
  estimateE1rmRange,
  formatStrengthIntensityReferences
} from '../../../../server/utils/strength-intensity'

describe('strength intensity references', () => {
  it('returns the Epley, Brzycki, and Wathan spread for valid 1-8 rep sets', () => {
    expect(estimateE1rmRange(100, 5)).toEqual({
      minKg: 112.5,
      maxKg: 116.67
    })
    expect(estimateE1rmRange(100, 9)).toBeNull()
    expect(estimateE1rmRange(0, 5)).toBeNull()
  })

  it('normalizes pounds and uses the current session rather than a historical maximum', () => {
    const references = buildStrengthIntensityReferences([
      {
        exerciseName: 'Back Squat',
        reps: 5,
        weight: 220.462,
        weightUnit: 'lb',
        rpe: 8,
        performedAt: new Date('2026-08-01')
      },
      {
        exerciseName: 'Back Squat',
        reps: 5,
        weight: 95,
        weightUnit: 'kg',
        rpe: 7,
        performedAt: new Date('2026-08-20')
      }
    ])

    expect(references).toEqual([
      expect.objectContaining({
        exerciseName: 'Back Squat',
        e1rmKg: { minKg: 106.88, maxKg: 110.83 },
        sampleCount: 2,
        latestRpe: 7,
        estimatedRir: 3,
        progressionAdjustment: 0
      })
    ])
  })

  it('uses the hardest set in the latest workout so a final easy set cannot hide failure', () => {
    const references = buildStrengthIntensityReferences([
      {
        exerciseName: 'Back Squat',
        reps: 5,
        weight: 95,
        weightUnit: 'kg',
        rpe: 7,
        performedAt: new Date('2026-08-20'),
        setOrder: 2
      },
      {
        exerciseName: 'Back Squat',
        reps: 5,
        weight: 100,
        weightUnit: 'kg',
        rpe: 10,
        performedAt: new Date('2026-08-20'),
        setOrder: 0
      }
    ])

    expect(references[0]).toMatchObject({
      latestRpe: 10,
      estimatedRir: 0,
      progressionAdjustment: -0.025
    })
  })

  it('fills blank matching set loads with a conservative RIR-adjusted target', () => {
    const structure = {
      blocks: [
        {
          steps: [
            {
              name: 'Back Squat',
              loadMode: 'weight_kg',
              setRows: [
                { value: '5', loadValue: '' },
                { value: '5', loadValue: '90' }
              ]
            }
          ]
        }
      ]
    }
    const references = buildStrengthIntensityReferences([
      {
        exerciseName: 'Back Squat',
        reps: 5,
        weight: 100,
        weightUnit: 'kg',
        rpe: 7,
        performedAt: new Date('2026-08-20')
      }
    ])

    applyStrengthIntensityTargets(structure, references, 'Kilograms')

    expect(structure.blocks[0]!.steps[0]).toMatchObject({
      loadMode: 'weight_kg',
      setRows: [
        { value: '5', loadValue: '97.5' },
        { value: '5', loadValue: '90' }
      ]
    })
  })

  it('rounds targets in the preferred pounds unit', () => {
    const structure = {
      blocks: [
        {
          steps: [
            {
              name: 'Deadlift',
              loadMode: 'none',
              setRows: [{ value: '3', loadValue: '' }]
            }
          ]
        }
      ]
    }
    const references = buildStrengthIntensityReferences([
      { exerciseName: 'Deadlift', reps: 3, weight: 180, weightUnit: 'kg', rpe: 8 }
    ])

    applyStrengthIntensityTargets(structure, references, 'Pounds')

    expect(structure.blocks[0]!.steps[0]).toMatchObject({
      loadMode: 'weight_lb',
      setRows: [{ value: '3', loadValue: '380' }]
    })
  })

  it('uses an existing concrete step unit when filling a partially prescribed exercise', () => {
    const structure = {
      blocks: [
        {
          steps: [
            {
              name: 'Back Squat',
              loadMode: 'weight_lb',
              setRows: [
                { value: '5', loadValue: '100' },
                { value: '5', loadValue: '' }
              ]
            }
          ]
        }
      ]
    }
    const references = buildStrengthIntensityReferences([
      { exerciseName: 'Back Squat', reps: 5, weight: 100, weightUnit: 'kg', rpe: 8 }
    ])

    applyStrengthIntensityTargets(structure, references, 'Kilograms')

    expect(structure.blocks[0]!.steps[0]).toMatchObject({
      loadMode: 'weight_lb',
      setRows: [
        { value: '5', loadValue: '100' },
        { value: '5', loadValue: '215' }
      ]
    })
  })

  it('does not relabel partially populated rows whose existing load unit is ambiguous', () => {
    const structure = {
      blocks: [
        {
          steps: [
            {
              name: 'Back Squat',
              loadMode: 'none',
              setRows: [
                { value: '5', loadValue: '100' },
                { value: '5', loadValue: '' }
              ]
            }
          ]
        }
      ]
    }
    const references = buildStrengthIntensityReferences([
      { exerciseName: 'Back Squat', reps: 5, weight: 100, weightUnit: 'kg', rpe: 8 }
    ])

    applyStrengthIntensityTargets(structure, references, 'Kilograms')

    expect(structure.blocks[0]!.steps[0]).toMatchObject({
      loadMode: 'none',
      setRows: [
        { value: '5', loadValue: '100' },
        { value: '5', loadValue: '' }
      ]
    })
  })

  it('does not fabricate a load when no exercise history matches', () => {
    const structure = {
      blocks: [
        {
          steps: [
            {
              name: 'Front Squat',
              loadMode: 'none',
              setRows: [{ value: '5', loadValue: '' }]
            }
          ]
        }
      ]
    }

    applyStrengthIntensityTargets(structure, [], 'Kilograms')

    expect(structure.blocks[0]!.steps[0]).toMatchObject({
      loadMode: 'none',
      setRows: [{ value: '5', loadValue: '' }]
    })
  })

  it('requires repeated comparable sessions before proposing progression and programme gates hold numeric targets', () => {
    const history = ['2026-10-01', '2026-10-06'].map((performedAt) => ({
      exerciseName: 'Squat',
      reps: 6,
      weight: 60,
      weightUnit: 'kg',
      rpe: 7,
      performedAt
    }))
    const references = buildStrengthIntensityReferences(history, new Date('2026-10-08'))
    expect(references[0]?.progressionAdjustment).toBe(0.025)
    expect(buildStrengthIntensityReferences(history.slice(0, 1))[0]?.progressionAdjustment).toBe(0)
    const structure = {
      blocks: [
        {
          steps: [
            { name: 'Squat', loadMode: 'weight_kg', setRows: [{ value: '6', loadValue: '' }] }
          ]
        }
      ]
    }
    applyStrengthIntensityTargets(structure, references, 'Kilograms', {
      allowLoadIncrease: false,
      targetRir: 4
    })
    expect(structure.blocks[0]!.steps[0]!.setRows[0]!.loadValue).toBe('52.5')
  })

  it('does not promote missing effort or undated/stale/future history into load progression', () => {
    const base = { exerciseName: 'Squat', reps: 6, weight: 60, weightUnit: 'kg' }
    expect(
      buildStrengthIntensityReferences([
        { ...base, performedAt: '2026-10-06' },
        { ...base, rpe: 7, performedAt: '2026-10-01' }
      ])[0]
    ).toMatchObject({ latestRpe: null, progressionAdjustment: 0 })
    expect(
      buildStrengthIntensityReferences(
        [
          { ...base, rpe: 7 },
          { ...base, rpe: 7, performedAt: '2026-01-01' },
          { ...base, rpe: 7, performedAt: '2026-10-15' }
        ],
        new Date('2026-10-08')
      )
    ).toEqual([])
  })

  it('does not add external weight to a bodyweight prescription when programme load-mode gates apply', () => {
    const structure = {
      blocks: [
        { steps: [{ name: 'Squat', loadMode: 'none', setRows: [{ value: '8', loadValue: '' }] }] }
      ]
    }
    const references = buildStrengthIntensityReferences([
      { exerciseName: 'Squat', reps: 5, weight: 60, weightUnit: 'kg', rpe: 7 }
    ])
    applyStrengthIntensityTargets(structure, references, 'Kilograms', {
      onlyConcreteLoads: true,
      targetRir: 4,
      allowLoadIncrease: false
    })
    expect(structure.blocks[0]!.steps[0]!.setRows[0]!.loadValue).toBe('')
    expect(structure.blocks[0]!.steps[0]!.loadMode).toBe('none')
  })

  it('formats the history as generator context and omits an empty section', () => {
    const references = buildStrengthIntensityReferences([
      { exerciseName: 'Back Squat', reps: 5, weight: 100, weightUnit: 'kg', rpe: 8 }
    ])

    expect(formatStrengthIntensityReferences(references)).toContain(
      'Back Squat: e1RM 112.5-116.7 kg; latest RPE 8 (estimated RIR 2)'
    )
    expect(formatStrengthIntensityReferences([])).toBe('')
  })
})
