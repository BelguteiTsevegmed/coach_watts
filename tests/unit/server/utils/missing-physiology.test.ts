import { describe, expect, it } from 'vitest'
import FitParser from 'fit-file-parser'
import {
  normalizeStructuredWorkoutForPersistence,
  computeStructuredWorkoutMetrics
} from '../../../../server/utils/structured-workout-persistence'
import {
  resolveWorkoutTargeting,
  applyTargetFormatPolicyToStep
} from '../../../../trigger/utils/workout-targeting'
import { resolveWorkoutExportContext } from '../../../../server/utils/workout-export-settings'
import { adaptStructuredWorkout } from '../../../../shared/structured-workout-contract'
import { WorkoutConverter } from '../../../../server/utils/workout-converter'
import { resolvePhysiologyReferences } from '../../../../shared/physiology-references'
import { serializeCanonicalForProvider } from '../../../../server/utils/canonical-workout-serializer'

const unknownRefs = {
  ftp: 0,
  lthr: 0,
  maxHr: 0,
  thresholdPace: 0,
  hrZones: [],
  powerZones: [],
  paceZones: []
}

describe('prescriptions without athlete physiology', () => {
  it('replaces an unusable strict HR target with executable effort cues', () => {
    const { targetPolicy, targetFormatPolicy } = resolveWorkoutTargeting({})
    const result = normalizeStructuredWorkoutForPersistence(
      {
        steps: [
          {
            type: 'Active',
            intent: 'endurance',
            durationSeconds: 1800,
            heartRate: { value: 0.8, units: 'LTHR' }
          }
        ]
      },
      { workoutType: 'Run', refs: unknownRefs, targetPolicy, targetFormatPolicy }
    )
    expect(result.steps[0].primaryTarget).toBe('rpe')
    expect(result.steps[0].rpe).toBe(4)
    expect(result.steps[0].heartRate).toBeUndefined()
    expect(result.steps[0].description).toContain('sentences')
  })

  it('does not fabricate watts during format conversion', () => {
    const { targetFormatPolicy } = resolveWorkoutTargeting({
      targetFormatPolicy: { power: { mode: 'watts' } }
    })
    const step: any = { power: { value: 0.8, units: '%' } }
    applyTargetFormatPolicyToStep(step, targetFormatPolicy, unknownRefs)
    expect(step.power).toEqual({ value: 0.8, units: '%' })
  })

  it('retains duration and unknown stress/distance for effort-only sessions', () => {
    const canonical = adaptStructuredWorkout({
      steps: [{ durationSeconds: 1800, primaryTarget: 'rpe', rpe: 4 }]
    })
    const metrics = computeStructuredWorkoutMetrics(canonical, {
      refs: unknownRefs,
      fallbackOrder: ['rpe'],
      workoutType: 'Run'
    })
    expect(metrics.durationSec).toBe(1800)
    expect(metrics.tss).toBeNull()
    expect(metrics.distanceMeters).toBeNull()
    expect(metrics.workIntensity).toBeNull()
  })

  it('keeps a frozen unknown FTP unknown even when live FTP is known', () => {
    const context = resolveWorkoutExportContext({
      workout: { lastGenerationSettingsSnapshot: { thresholds: { ftp: null } } },
      liveUserFtp: 300
    })
    expect(context.ftp).toBe(0)
  })

  it('exports effort targets even when an older strict metric policy requests power', () => {
    const text = WorkoutConverter.toIntervalsICU({
      title: 'Effort',
      description: '',
      sportSettings: { targetPolicy: { primaryMetric: 'power', strictPrimary: true } },
      steps: [{ type: 'Active', durationSeconds: 600, rpe: 4 }]
    })
    expect(text).toContain('RPE 4')
    expect(text).not.toContain('%')
  })

  it('exports an effort session with its RPE cue and open FIT target', () => {
    const workout = {
      title: 'Easy run',
      description: '',
      steps: [{ type: 'Active', durationSeconds: 1800, primaryTarget: 'rpe', rpe: 4 }]
    }
    expect(WorkoutConverter.toIntervalsICU(workout)).toContain('RPE 4')
    expect(WorkoutConverter.toFIT(workout).length).toBeGreaterThan(0)
    expect(WorkoutConverter.toZWO(workout)).toContain('<FreeRide')
    expect(WorkoutConverter.toZWO(workout)).toContain('RPE 4')
    expect(() =>
      WorkoutConverter.toERG({
        ...workout,
        steps: [{ durationSeconds: 600, power: { value: 0.8, units: '%' } }]
      })
    ).toThrow(/FTP/)
  })

  it('retains effort instructions in a decoded FIT workout', async () => {
    const bytes = serializeCanonicalForProvider({
      destination: 'fit',
      type: 'Run',
      title: 'Easy run',
      description: '',
      structure: {
        steps: [
          {
            type: 'Active',
            durationSeconds: 600,
            primaryTarget: 'rpe',
            rpe: 4,
            description: 'Speak comfortably in full sentences.'
          }
        ]
      }
    }) as Uint8Array
    const decoded: any = await new FitParser({ mode: 'list' }).parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    )
    expect(decoded.workout_step.target_type).toBe('open')
    expect(new TextDecoder().decode(bytes)).toContain(
      'RPE 4/10. Speak comfortably in full sentences.'
    )
  })

  it('exports a standalone canonical template using its accepted FTP rather than live settings', () => {
    const physiology = resolvePhysiologyReferences({
      workoutType: 'Ride',
      sportSettings: { ftp: 280 }
    })
    const canonical = adaptStructuredWorkout({
      physiology,
      steps: [{ type: 'Active', durationSeconds: 600, power: { value: 0.8, units: '%' } }]
    })
    const exported = serializeCanonicalForProvider({
      destination: 'erg',
      title: 'Tempo',
      description: '',
      type: 'Ride',
      structure: canonical,
      liveUserFtp: 300
    })
    expect(exported).toContain('FTP = 280')
    expect(exported).toContain('224')
  })

  it('retains frozen HR zones alongside physiology provenance', () => {
    const hrZones = [{ name: 'Z2', min: 130, max: 150 }]
    const context = resolveWorkoutExportContext({
      workout: {
        structuredWorkout: {
          physiology: resolvePhysiologyReferences({
            workoutType: 'Run',
            sportSettings: { lthr: 172 }
          }),
          zoneProfileSnapshot: { heartRate: { ranges: hrZones } }
        }
      }
    })
    expect(context.sportSettings?.hrZones).toEqual(hrZones)
  })
})
