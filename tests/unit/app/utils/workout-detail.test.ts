import { describe, expect, it } from 'vitest'
import {
  ADMIN_ONLY_WORKOUT_SECTIONS,
  WORKOUT_DETAIL_GROUPS,
  WORKOUT_SECTION_GROUP,
  calculateWorkoutForm,
  getAveragePaceSecondsPerKm,
  getFormStatus,
  isPaceSportType,
  resolveWorkoutDetailAnchor,
  workoutHasPowerData
} from '../../../../app/utils/workout-detail'

describe('workout detail groups', () => {
  it('keeps the section bar to five athlete-facing groups', () => {
    expect(WORKOUT_DETAIL_GROUPS.map((group) => group.key)).toEqual([
      'summary',
      'charts',
      'laps',
      'map',
      'details'
    ])
  })

  it('assigns every legacy section anchor to a group', () => {
    for (const anchor of [
      'analysis',
      'power-curve',
      'intervals',
      'advanced',
      'map',
      'pacing',
      'timeline',
      'zones',
      'efficiency',
      'metrics',
      'training-impact',
      'overview'
    ]) {
      expect(WORKOUT_SECTION_GROUP[anchor], anchor).toBeTruthy()
    }
  })

  it('treats raw data as admin-only', () => {
    expect(ADMIN_ONLY_WORKOUT_SECTIONS.has('raw-data')).toBe(true)
    expect(ADMIN_ONLY_WORKOUT_SECTIONS.has('metrics')).toBe(false)
  })
})

describe('resolveWorkoutDetailAnchor', () => {
  it('maps old section anchors to their section and group', () => {
    expect(resolveWorkoutDetailAnchor('#intervals')).toEqual({
      group: 'laps',
      section: 'intervals'
    })
    expect(resolveWorkoutDetailAnchor('power-curve')).toEqual({
      group: 'charts',
      section: 'power-curve'
    })
    expect(resolveWorkoutDetailAnchor('#training-impact')).toEqual({
      group: 'summary',
      section: 'training-impact'
    })
  })

  it('resolves group anchors directly', () => {
    expect(resolveWorkoutDetailAnchor('#details')).toEqual({ group: 'details', section: null })
    expect(resolveWorkoutDetailAnchor('map')).toEqual({ group: 'map', section: null })
  })

  it('ignores unknown or empty anchors', () => {
    expect(resolveWorkoutDetailAnchor('#nope')).toBeNull()
    expect(resolveWorkoutDetailAnchor('')).toBeNull()
    expect(resolveWorkoutDetailAnchor(undefined)).toBeNull()
  })
})

describe('getFormStatus', () => {
  it('describes form in plain language using the app-wide bands', () => {
    expect(getFormStatus(30)?.key).toBe('very_fresh')
    expect(getFormStatus(12)?.key).toBe('fresh')
    expect(getFormStatus(2)?.key).toBe('neutral')
    expect(getFormStatus(-8)?.key).toBe('neutral')
    expect(getFormStatus(-15)?.key).toBe('tired')
    expect(getFormStatus(-30)?.key).toBe('very_tired')
  })

  it('returns null without a value', () => {
    expect(getFormStatus(null)).toBeNull()
    expect(getFormStatus(Number.NaN)).toBeNull()
  })
})

describe('calculateWorkoutForm', () => {
  it('is fitness minus fatigue, rounded', () => {
    expect(calculateWorkoutForm({ ctl: 33.7, atl: 41 })).toBe(-7)
    expect(calculateWorkoutForm({ ctl: 42, atl: null })).toBeNull()
    expect(calculateWorkoutForm(null)).toBeNull()
  })
})

describe('sport helpers', () => {
  it('treats runs, walks and hikes as pace sports, rides and strength not', () => {
    expect(isPaceSportType('Run')).toBe(true)
    expect(isPaceSportType('TrailRun')).toBe(true)
    expect(isPaceSportType('Walk')).toBe(true)
    expect(isPaceSportType('Hike')).toBe(true)
    expect(isPaceSportType('Ride')).toBe(false)
    expect(isPaceSportType('WeightTraining')).toBe(false)
    expect(isPaceSportType(null)).toBe(false)
  })

  it('detects power data only when there is some', () => {
    expect(workoutHasPowerData({ averageWatts: null, streams: null })).toBe(false)
    expect(workoutHasPowerData({ averageWatts: 0, streams: { watts: [0, 0] } })).toBe(false)
    expect(workoutHasPowerData({ averageWatts: 210 })).toBe(true)
    expect(workoutHasPowerData({ streams: { watts: [0, 180] } })).toBe(true)
  })

  it('derives average pace from speed, else from distance and duration', () => {
    // 2.7777 m/s ≈ 6:00 /km
    expect(getAveragePaceSecondsPerKm({ averageSpeed: 1000 / 360 })).toBeCloseTo(360)
    expect(
      getAveragePaceSecondsPerKm({ averageSpeed: null, distanceMeters: 10000, durationSec: 3000 })
    ).toBe(300)
    expect(getAveragePaceSecondsPerKm({ distanceMeters: 0, durationSec: 3000 })).toBeNull()
  })
})
