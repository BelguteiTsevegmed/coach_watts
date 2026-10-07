import { describe, expect, it } from 'vitest'
import {
  buildRecalculationContext,
  isReplaceableWorkout,
  validateRecalculationProposal
} from '../../../../../server/utils/plans/week-recalculation'

const workout = {
  id: 'local',
  userId: 'u',
  date: new Date('2026-10-08Z'),
  trainingWeekId: 'week',
  title: 'Local',
  externalId: 'ai_gen_local',
  managedBy: 'COACH_WATTS',
  completed: false,
  completionStatus: 'PENDING',
  modifiedLocally: false,
  syncStatus: 'LOCAL_ONLY',
  durationSec: 3600,
  tss: 40
} as any
const week = {
  id: 'week',
  startDate: new Date('2026-10-05Z'),
  endDate: new Date('2026-10-11Z'),
  volumeTargetMinutes: 120,
  tssTarget: 80
} as any
const context = (availability: any[] = []) =>
  buildRecalculationContext({
    week,
    workouts: [workout],
    completed: [],
    availability,
    timezone: 'UTC',
    today: '2026-10-07',
    anchorWorkoutIds: []
  })
const ride = (date = '2026-10-08', extra = {}) => ({
  date,
  workoutType: 'Ride',
  title: 'Ride',
  description: 'Easy',
  reasoningText: 'Aerobic',
  durationMinutes: 60,
  targetTSS: 40,
  ...extra
})
const proposal = (first = ride()) => ({
  weekSummary: 'Aerobic',
  days: [
    first,
    ...['2026-10-09', '2026-10-10', '2026-10-11'].map((date) =>
      ride(date, { workoutType: 'Rest', durationMinutes: 0, targetTSS: 0 })
    )
  ]
})

describe('recalculation preservation and proposal validation', () => {
  it('replaces only untouched local AI sessions', () => {
    expect(isReplaceableWorkout(workout, 'week', '2026-10-08', '2026-10-11', [])).toBe(true)
  })
  it.each([
    { completed: true },
    { completionStatus: 'COMPLETED' },
    { managedBy: 'USER' },
    { managedBy: 'COACH' },
    { modifiedLocally: true },
    { syncConflict: true },
    { syncStatus: 'PENDING' },
    { syncStatus: 'FAILED' },
    { lastStructureEditSource: 'USER' },
    { lastStructureEditSource: 'REMOTE_IMPORT' },
    { trainingWeekId: 'another-week' },
    { lastStructurePublishedAt: new Date(), lastStructureEditSource: 'USER' },
    { rawJson: { isAnchor: true } },
    { rawJson: { locked: true } },
    { date: new Date('2026-10-07Z') },
    { date: new Date('2026-10-12Z') }
  ])('preserves protected sessions (%j)', (override) => {
    expect(
      isReplaceableWorkout({ ...workout, ...override }, 'week', '2026-10-08', '2026-10-11', [])
    ).toBe(false)
  })
  it('preserves explicit anchors', () => {
    expect(isReplaceableWorkout(workout, 'week', '2026-10-08', '2026-10-11', ['local'])).toBe(false)
  })
  it('accepts a complete proposal within the remaining budget', () => {
    expect(validateRecalculationProposal(proposal(), context()).days).toHaveLength(4)
  })
  it('rejects dose on a rest day', () => {
    expect(() =>
      validateRecalculationProposal(
        proposal(ride('2026-10-08', { workoutType: 'Rest' })),
        context()
      )
    ).toThrow('Rest days')
  })
  it('rejects excess TSS separately from duration', () => {
    expect(() =>
      validateRecalculationProposal(proposal(ride('2026-10-08', { targetTSS: 81 })), context())
    ).toThrow('weekly TSS')
  })
  it('respects unavailable weekdays', () => {
    expect(() =>
      validateRecalculationProposal(
        proposal(),
        context([{ dayOfWeek: 4, morning: false, afternoon: false, evening: false }])
      )
    ).toThrow('No training availability')
  })
  it('respects configured slot duration and activity types', () => {
    expect(() =>
      validateRecalculationProposal(
        proposal(),
        context([{ dayOfWeek: 4, slots: [{ duration: 30, activityTypes: ['Ride'] }] }])
      )
    ).toThrow('available time')
    expect(() =>
      validateRecalculationProposal(
        proposal(),
        context([{ dayOfWeek: 4, slots: [{ duration: 90, activityTypes: ['Swim'] }] }])
      )
    ).toThrow('available time')
    expect(
      validateRecalculationProposal(
        proposal(),
        context([{ dayOfWeek: 4, slots: [{ duration: 60, activityTypes: ['Ride'] }] }])
      ).days
    ).toHaveLength(4)
  })
  it('respects legacy availability windows', () => {
    expect(() =>
      validateRecalculationProposal(
        proposal(ride('2026-10-08', { timeOfDay: 'evening' })),
        context([{ dayOfWeek: 4, morning: true, evening: false }])
      )
    ).toThrow('Unavailable training window')
  })
  it('does not combine separate time slots into a single longer session', () => {
    expect(() =>
      validateRecalculationProposal(
        proposal(),
        context([
          {
            dayOfWeek: 4,
            slots: [{ duration: 30 }, { duration: 30 }]
          }
        ])
      )
    ).toThrow('available time')
  })
  it('handles exhausted budgets with explicit rest sessions', () => {
    const exhausted = { ...context(), remainingVolumeMinutes: 0, remainingTSS: 0 }
    const rests = {
      weekSummary: 'Recovery',
      days: exhausted.eligibleDays.map((date) =>
        ride(date, { workoutType: 'Rest', durationMinutes: 0, targetTSS: 0 })
      )
    }
    expect(validateRecalculationProposal(rests, exhausted).days).toHaveLength(4)
    expect(() => validateRecalculationProposal(proposal(), exhausted)).toThrow('weekly volume')
  })
  it('walks calendar days across daylight saving transitions', () => {
    const result = buildRecalculationContext({
      week: { ...week, startDate: new Date('2026-10-19Z'), endDate: new Date('2026-10-25Z') },
      workouts: [],
      completed: [],
      availability: [],
      timezone: 'Europe/Warsaw',
      today: '2026-10-23',
      anchorWorkoutIds: []
    })
    expect(result.eligibleDays).toEqual(['2026-10-24', '2026-10-25'])
  })
})

it('subtracts completed and preserved running from the running budget during recalculation', () => {
  const snapshot = buildRecalculationContext({
    week: { ...week, volumeTargetMinutes: 300, sportVolumeTargets: { run: 72, ride: 228 } },
    workouts: [{ ...workout, id: 'anchor', type: 'Run', durationSec: 30 * 60, managedBy: 'USER' }],
    completed: [
      {
        date: new Date('2026-10-06Z'),
        type: 'Run',
        durationSec: 30 * 60,
        tss: 0,
        plannedWorkoutId: null
      }
    ],
    availability: [],
    timezone: 'UTC',
    today: '2026-10-07',
    anchorWorkoutIds: []
  })
  expect(snapshot.remainingSportVolumeTargets).toEqual({ run: 12, ride: 228 })
  const value = {
    weekSummary: 'Easy',
    days: ['2026-10-09', '2026-10-10', '2026-10-11'].map((date, i) =>
      ride(date, {
        workoutType: i === 0 ? 'Run' : 'Rest',
        durationMinutes: i === 0 ? 20 : 0,
        targetTSS: 0
      })
    )
  }
  expect(() => validateRecalculationProposal(value, snapshot)).toThrow('sport-specific')
})
