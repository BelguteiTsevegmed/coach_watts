import { describe, expect, it } from 'vitest'
import {
  resolvePhysiologyReferences,
  formatPhysiologyReferencePrompt,
  applyAvailableReferenceTargets
} from '../../../shared/physiology-references'
import {
  resolveWorkoutTargeting,
  buildPlannedWorkoutSettingsSnapshot
} from '../../../trigger/utils/workout-targeting'

const now = new Date('2026-10-07T12:00:00Z')
describe('sport physiology reference resolution', () => {
  it('keeps absent values explicit through prompt and frozen settings', () => {
    const resolution = resolvePhysiologyReferences({ workoutType: 'Ride', now })
    expect(
      Object.values(resolution.references).every((ref) => ref.value === null && !ref.usable)
    ).toBe(true)
    const { targetPolicy, targetFormatPolicy } = resolveWorkoutTargeting({}, null, resolution)
    expect(targetPolicy.primaryMetric).toBe('rpe')
    const snapshot = buildPlannedWorkoutSettingsSnapshot(
      {},
      resolution.refs,
      targetPolicy,
      targetFormatPolicy,
      resolution
    )
    expect(snapshot.thresholds).toMatchObject({
      ftp: null,
      lthr: null,
      maxHr: null,
      thresholdPace: null
    })
    expect(snapshot.physiology?.references.ftp.status).toBe('unknown')
    expect(formatPhysiologyReferencePrompt(resolution)).not.toMatch(/250|160|190/)
    expect(resolution.calibrationOptions[0].id).toBe('cycling_ftp_benchmark')
  })

  it('does not transfer cycling FTP into running targets', () => {
    const result = resolvePhysiologyReferences({ workoutType: 'Run', user: { ftp: 300 }, now })
    expect(result.refs.ftp).toBe(0)
    expect(result.calibrationOptions[0].id).toBe('running_threshold_benchmark')
  })

  it('rejects a profile from another sport', () => {
    const result = resolvePhysiologyReferences({
      workoutType: 'Run',
      sportSettings: { id: 'ride', types: ['Ride'], ftp: 300, lthr: 170, thresholdPace: 3 },
      now
    })
    expect(result.refs).toEqual({ ftp: 0, lthr: 0, maxHr: 0, thresholdPace: 0 })
  })

  it('does not transfer the default profile cycling FTP into running', () => {
    const result = resolvePhysiologyReferences({
      workoutType: 'Run',
      sportSettings: { id: 'default', isDefault: true, types: [], ftp: 300 },
      now
    })
    expect(result.refs.ftp).toBe(0)
    expect(result.references.ftp.value).toBeNull()
  })

  it('preserves configured values without claiming a measurement date', () => {
    const result = resolvePhysiologyReferences({
      workoutType: 'Run',
      sportSettings: { id: 'run', types: ['Run'], lthr: 172 },
      now
    })
    expect(result.references.lthr).toMatchObject({
      value: 172,
      status: 'configured',
      measuredAt: null,
      confidence: 'unknown',
      sufficientlyCurrent: null,
      usable: true
    })
  })

  it('uses a current measured reference and records deterministic conflicts', () => {
    const result = resolvePhysiologyReferences({
      workoutType: 'Ride',
      sportSettings: {
        id: 'ride',
        types: ['Ride'],
        ftp: 285,
        referenceConflicts: { ftp: [270, 270] },
        zoneConfiguration: {
          physiologyReferences: {
            ftp: {
              value: 285,
              status: 'measured',
              source: 'benchmark',
              measuredAt: '2026-10-01',
              confidence: 'high'
            }
          }
        }
      },
      now
    })
    expect(result.refs.ftp).toBe(285)
    expect(result.references.ftp).toMatchObject({
      status: 'conflicting',
      sufficientlyCurrent: true,
      alternatives: [270],
      usable: true
    })
    expect(result.guidance.join(' ')).toContain('regenerate')
  })

  it('keeps stale or unqualified estimates out of prescriptions', () => {
    const result = resolvePhysiologyReferences({
      workoutType: 'Ride',
      sportSettings: {
        types: ['Ride'],
        ftp: 285,
        lthr: 172,
        zoneConfiguration: {
          physiologyReferences: {
            ftp: { value: 285, status: 'measured', measuredAt: '2025-01-01' },
            lthr: { value: 172, status: 'estimated', measuredAt: '2026-10-01' }
          }
        }
      },
      now
    })
    expect(result.refs.ftp).toBe(0)
    expect(result.references.ftp.status).toBe('stale')
    expect(result.refs.lthr).toBe(0)
    expect(result.references.lthr.status).toBe('unknown')
  })

  it('uses qualified accepted estimates and retains their provenance', () => {
    const result = resolvePhysiologyReferences({
      workoutType: 'Ride',
      sportSettings: {
        types: ['Ride'],
        ftp: 285,
        zoneConfiguration: {
          physiologyReferences: {
            ftp: {
              value: 285,
              status: 'estimated',
              source: 'accepted_threshold_detection',
              measuredAt: '2026-10-01',
              confidence: 'medium',
              evidenceQualified: true,
              workoutId: 'benchmark-1'
            }
          }
        }
      },
      now
    })
    expect(result.references.ftp).toMatchObject({
      status: 'estimated',
      source: 'accepted_threshold_detection',
      sufficientlyCurrent: true,
      usable: true
    })
  })

  it('handles max-HR-only references without inventing LTHR', () => {
    const resolution = resolvePhysiologyReferences({
      workoutType: 'Run',
      sportSettings: { maxHr: 183 },
      now
    })
    const { targetPolicy, targetFormatPolicy } = resolveWorkoutTargeting({}, null, resolution)
    expect(targetPolicy.primaryMetric).toBe('heartRate')
    expect(targetFormatPolicy.heartRate.mode).toBe('percentMaxHr')
    const step: any = { primaryTarget: 'heartRate', heartRate: { value: 0.7, units: 'HR' } }
    applyAvailableReferenceTargets(step, resolution.refs)
    expect(step.heartRate).toEqual({ value: 0.7, units: 'HR' })
  })
})
