import { describe, expect, it } from 'vitest'
import { addDaysToKey, daysBetweenKeys } from '../../../../app/utils/date-keys'
import type { CalendarActivity } from '../../../../app/types/calendar'
import {
  buildComingUp,
  formatTrainingDistance,
  formatTrainingDuration,
  getWeekDateKeys,
  pickCountdownGoal,
  summarizeWeek
} from '../../../../app/utils/today-plan'

// Sunday 4 October 2026
const TODAY = '2026-10-04'

function completed(
  id: string,
  isoDate: string,
  overrides: Partial<CalendarActivity> = {}
): CalendarActivity {
  return {
    id,
    title: `Completed ${id}`,
    date: isoDate,
    type: 'Run',
    source: 'completed',
    status: 'completed',
    duration: 3000,
    ...overrides
  }
}

function planned(
  id: string,
  dateKey: string,
  overrides: Partial<CalendarActivity> = {}
): CalendarActivity {
  return {
    id,
    title: `Planned ${id}`,
    date: `${dateKey}T00:00:00.000Z`,
    type: 'Run',
    source: 'planned',
    status: 'planned',
    duration: 2400,
    ...overrides
  }
}

describe('date key helpers', () => {
  it('adds days across month boundaries', () => {
    expect(addDaysToKey('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDaysToKey('2026-10-01', -1)).toBe('2026-09-30')
  })

  it('counts whole days between keys', () => {
    expect(daysBetweenKeys(TODAY, '2026-12-13')).toBe(70)
    expect(daysBetweenKeys(TODAY, TODAY)).toBe(0)
    expect(daysBetweenKeys(TODAY, '2026-10-03')).toBe(-1)
  })

  it('builds a Monday-first week that contains today', () => {
    expect(getWeekDateKeys(TODAY)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04'
    ])
    expect(getWeekDateKeys('2026-09-28')[0]).toBe('2026-09-28')
  })
})

describe('summarizeWeek', () => {
  it('counts unplanned training as done and keeps open sessions in the total', () => {
    const summary = summarizeWeek(
      [
        completed('a', '2026-09-29T06:30:00.000Z'),
        completed('b', '2026-09-30T06:30:00.000Z', { duration: 4140 }),
        planned('today', TODAY)
      ],
      TODAY,
      'UTC'
    )

    expect(summary.sessionsDone).toBe(2)
    expect(summary.sessionsTotal).toBe(3)
    expect(summary.doneDurationSec).toBe(7140)
    expect(summary.totalDurationSec).toBe(9540)
    expect(summary.hasActivity).toBe(true)

    const states = Object.fromEntries(summary.days.map((d) => [d.dateKey, d.state]))
    expect(states['2026-09-28']).toBe('rest')
    expect(states['2026-09-29']).toBe('done')
    expect(states[TODAY]).toBe('planned')
    expect(summary.days.find((d) => d.dateKey === TODAY)?.isToday).toBe(true)
  })

  it('marks past open sessions as missed', () => {
    const summary = summarizeWeek([planned('p', '2026-09-30', { status: 'missed' })], TODAY, 'UTC')
    const day = summary.days.find((d) => d.dateKey === '2026-09-30')!
    expect(day.state).toBe('missed')
    expect(day.sessions[0]?.status).toBe('missed')
    expect(summary.sessionsDone).toBe(0)
    expect(summary.sessionsTotal).toBe(1)
  })

  it('matches an unlinked completion to the open session on the same day', () => {
    const summary = summarizeWeek(
      [
        planned('p', '2026-09-30', { status: 'missed', duration: 3600 }),
        completed('c', '2026-09-30T17:00:00.000Z', { duration: 3300 })
      ],
      TODAY,
      'UTC'
    )

    expect(summary.sessionsDone).toBe(1)
    expect(summary.sessionsTotal).toBe(1)
    expect(summary.totalDurationSec).toBe(3300)
    expect(summary.days.find((d) => d.dateKey === '2026-09-30')?.state).toBe('done')
  })

  it('counts sessions marked complete on the plan and ignores rest/notes', () => {
    const summary = summarizeWeek(
      [
        planned('done-on-plan', '2026-09-28', { status: 'completed_plan' }),
        planned('rest', '2026-10-01', { type: 'Rest' }),
        { ...planned('note', '2026-10-02'), type: 'Note' },
        {
          id: 'w',
          title: 'Wellness',
          date: '2026-10-02T00:00:00.000Z',
          source: 'wellness',
          status: 'completed'
        }
      ],
      TODAY,
      'UTC'
    )

    expect(summary.sessionsDone).toBe(1)
    expect(summary.sessionsTotal).toBe(1)
    expect(summary.days.find((d) => d.dateKey === '2026-10-01')?.state).toBe('rest')
  })

  it('places completed workouts on the athlete-local day', () => {
    // 23:30 in New York on Tuesday is already Wednesday in UTC.
    const summary = summarizeWeek(
      [completed('late', '2026-09-30T03:30:00.000Z')],
      TODAY,
      'America/New_York'
    )
    expect(summary.days.find((d) => d.dateKey === '2026-09-29')?.state).toBe('done')
    expect(summary.days.find((d) => d.dateKey === '2026-09-30')?.state).toBe('rest')
  })

  it('reports an empty week', () => {
    const summary = summarizeWeek([], TODAY, 'UTC')
    expect(summary.hasActivity).toBe(false)
    expect(summary.days).toHaveLength(7)
    expect(summary.days.every((d) => d.state === 'rest')).toBe(true)
  })
})

describe('buildComingUp', () => {
  const upcoming = [
    { id: 'today', date: '2026-10-04T00:00:00.000Z', title: 'Easy', type: 'Run' },
    { id: 'mon', date: '2026-10-05T00:00:00.000Z', title: 'Tempo', type: 'Run' },
    { id: 'tue', date: '2026-10-06T00:00:00.000Z', title: 'Strength', type: 'WeightTraining' },
    { id: 'wed', date: '2026-10-07T00:00:00.000Z', title: 'Easy', type: 'Run' },
    { id: 'fri', date: '2026-10-09T00:00:00.000Z', title: 'Long', type: 'Run' }
  ]

  it('skips today, shows rest days between sessions and stops at the session cap', () => {
    const rows = buildComingUp(upcoming, TODAY, { maxSessions: 4 })
    expect(rows.map((r) => r.dateKey)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09'
    ])
    expect(rows.find((r) => r.dateKey === '2026-10-08')?.rest).toBe(true)
    expect(rows.find((r) => r.dateKey === '2026-10-09')?.workouts[0]?.id).toBe('fri')
  })

  it('never pads past the last scheduled session', () => {
    const rows = buildComingUp([upcoming[1]!], TODAY)
    expect(rows).toHaveLength(1)
  })

  it('treats explicit rest workouts as rest days', () => {
    const rows = buildComingUp(
      [
        { id: 'r', date: '2026-10-05T00:00:00.000Z', title: 'Rest', type: 'Rest' },
        { id: 't', date: '2026-10-06T00:00:00.000Z', title: 'Tempo', type: 'Run' }
      ],
      TODAY
    )
    expect(rows[0]).toMatchObject({ dateKey: '2026-10-05', rest: true, workouts: [] })
    expect(rows[1]?.rest).toBe(false)
  })

  it('returns nothing when no future sessions are scheduled', () => {
    expect(buildComingUp([upcoming[0]!], TODAY)).toEqual([])
    expect(buildComingUp([], TODAY)).toEqual([])
  })
})

describe('pickCountdownGoal', () => {
  it('picks the nearest active dated goal that has not passed', () => {
    const result = pickCountdownGoal(
      [
        { id: 'past', title: 'Old race', status: 'ACTIVE', eventDate: '2026-09-01T00:00:00Z' },
        { id: 'far', title: 'Marathon', status: 'ACTIVE', eventDate: '2027-04-01T00:00:00Z' },
        {
          id: 'half',
          title: 'Sub-1:45 Half Marathon',
          status: 'ACTIVE',
          eventDate: '2026-12-13T00:00:00Z'
        },
        { id: 'done', title: 'Done', status: 'COMPLETED', targetDate: '2026-11-01T00:00:00Z' },
        { id: 'undated', title: 'Lose weight', status: 'ACTIVE' }
      ],
      TODAY
    )
    expect(result?.goal.id).toBe('half')
    expect(result?.daysToGo).toBe(70)
  })

  it('falls back to the target date and allows race day itself', () => {
    const result = pickCountdownGoal(
      [{ id: 'g', title: 'Goal', status: 'ACTIVE', targetDate: '2026-10-04T00:00:00Z' }],
      TODAY
    )
    expect(result?.daysToGo).toBe(0)
  })

  it('returns null without a usable goal', () => {
    expect(pickCountdownGoal([], TODAY)).toBeNull()
  })
})

describe('training formatters', () => {
  it('formats durations compactly', () => {
    expect(formatTrainingDuration(2400)).toBe('40 min')
    expect(formatTrainingDuration(5400)).toBe('1h 30m')
    expect(formatTrainingDuration(7200)).toBe('2h')
    expect(formatTrainingDuration(20)).toBe('1 min')
    expect(formatTrainingDuration(0)).toBeNull()
    expect(formatTrainingDuration(null)).toBeNull()
  })

  it('formats distance in the athlete units', () => {
    expect(formatTrainingDistance(6667, 'Kilometers')).toBe('6.7 km')
    expect(formatTrainingDistance(6667, undefined)).toBe('6.7 km')
    expect(formatTrainingDistance(6667, 'Miles')).toBe('4.1 mi')
    expect(formatTrainingDistance(null, 'Kilometers')).toBeNull()
  })
})
