import { describe, expect, it } from 'vitest'
import {
  addDaysToKey,
  averageCompleteWeeks,
  buildWeeklyVolume,
  classifyForm,
  computeFitnessTrend,
  computeIntensitySplit,
  daysBetweenKeys,
  describeCountdown,
  goalProgressPct,
  goalTargetKey,
  hasPowerData,
  intensityVerdict,
  localDateKey,
  mondayOfKey,
  resolveSectionVisibility,
  sessionsPerWeek,
  sportGroupOf,
  sportsInVolume,
  trimLeadingEmptyWeeks,
  upcomingGoals,
  zoneSourcesWithData
} from './progress-summary'

// Sunday 4 October 2026, mid-morning UTC.
const TODAY = new Date('2026-10-04T09:00:00Z')

describe('date keys', () => {
  it('formats a local calendar day in the given time zone', () => {
    expect(localDateKey('2026-10-04T23:30:00Z', 'UTC')).toBe('2026-10-04')
    expect(localDateKey('2026-10-04T23:30:00Z', 'Europe/Budapest')).toBe('2026-10-05')
    expect(localDateKey('2026-10-04T03:00:00Z', 'America/Los_Angeles')).toBe('2026-10-03')
  })

  it('falls back to UTC for an invalid zone and empty string for invalid dates', () => {
    expect(localDateKey('2026-10-04T12:00:00Z', 'Not/AZone')).toBe('2026-10-04')
    expect(localDateKey('nope')).toBe('')
  })

  it('does calendar arithmetic on keys', () => {
    expect(addDaysToKey('2026-10-04', 1)).toBe('2026-10-05')
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetweenKeys('2026-10-04', '2026-12-13')).toBe(70)
    expect(mondayOfKey('2026-10-04')).toBe('2026-09-28') // Sunday → previous Monday
    expect(mondayOfKey('2026-09-28')).toBe('2026-09-28')
    expect(mondayOfKey('2026-10-01')).toBe('2026-09-28')
  })
})

describe('sportGroupOf', () => {
  it('groups provider sport types', () => {
    expect(sportGroupOf('Run')).toBe('run')
    expect(sportGroupOf('TrailRun')).toBe('run')
    expect(sportGroupOf('VirtualRide')).toBe('ride')
    expect(sportGroupOf('Swim')).toBe('swim')
    expect(sportGroupOf('WeightTraining')).toBe('strength')
    expect(sportGroupOf('Yoga')).toBe('other')
    expect(sportGroupOf(null)).toBe('other')
  })
})

describe('buildWeeklyVolume', () => {
  const workouts = [
    { date: '2026-10-03T06:30:00Z', type: 'Run', durationSec: 3600, distanceMeters: 10000 },
    { date: '2026-10-01T06:30:00Z', type: 'WeightTraining', durationSec: 1800 },
    { date: '2026-09-27T06:30:00Z', type: 'Run', durationSec: 5400, distanceMeters: 16000 },
    { date: '2026-09-21T06:30:00Z', type: 'Ride', durationSec: 7200, distanceMeters: 60000 },
    // Outside the 3-week window and in the future: ignored.
    { date: '2026-09-01T06:30:00Z', type: 'Run', durationSec: 3600, distanceMeters: 10000 },
    { date: '2026-10-06T06:30:00Z', type: 'Run', durationSec: 3600, distanceMeters: 10000 }
  ]

  it('buckets Monday–Sunday weeks, oldest first, with the current week last', () => {
    const weeks = buildWeeklyVolume(workouts, { weeks: 3, today: TODAY, timeZone: 'UTC' })
    expect(weeks.map((week) => week.weekStart)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28'])
    expect(weeks.map((week) => week.isCurrent)).toEqual([false, false, true])

    const [first, second, current] = weeks
    expect(first!.sessions).toBe(0)
    expect(second!.sessions).toBe(2)
    expect(second!.bySport.run.distanceMeters).toBe(16000)
    expect(second!.bySport.ride.durationSec).toBe(7200)
    expect(current!.sessions).toBe(2)
    expect(current!.durationSec).toBe(5400)
    expect(current!.distanceMeters).toBe(10000)
    expect(current!.bySport.strength.sessions).toBe(1)
  })

  it('lists the sports present in fixed order and averages complete weeks', () => {
    const weeks = buildWeeklyVolume(workouts, { weeks: 3, today: TODAY, timeZone: 'UTC' })
    expect(sportsInVolume(weeks)).toEqual(['run', 'ride', 'strength'])

    // The empty first week precedes any session, so only 21 Sep counts.
    const avg = averageCompleteWeeks(weeks)
    expect(avg.weeks).toBe(1)
    expect(avg.sessions).toBe(2)
    expect(avg.durationSec).toBe(5400 + 7200)
  })

  it('skips empty weeks before the first session when averaging', () => {
    const weeks = buildWeeklyVolume(
      [
        { date: '2026-09-15T06:00:00Z', type: 'Run', durationSec: 3600 },
        { date: '2026-09-29T06:00:00Z', type: 'Run', durationSec: 3600 }
      ],
      { weeks: 6, today: TODAY, timeZone: 'UTC' }
    )
    // Weeks of 14 Sep (1 session) and 21 Sep (0) are complete; 28 Sep is current.
    expect(averageCompleteWeeks(weeks)).toMatchObject({ weeks: 2, sessions: 0.5 })
    expect(averageCompleteWeeks(buildWeeklyVolume([], { weeks: 4, today: TODAY }))).toMatchObject({
      weeks: 0,
      sessions: 0
    })
  })

  it('trims empty weeks before the first session but keeps a minimum span', () => {
    const late = [{ date: '2026-10-01T06:00:00Z', type: 'Run', durationSec: 3600 }]
    const twelve = buildWeeklyVolume(late, { weeks: 12, today: TODAY })
    expect(trimLeadingEmptyWeeks(twelve, 6)).toHaveLength(6)

    const early = [{ date: '2026-08-20T06:00:00Z', type: 'Run', durationSec: 3600 }]
    const trimmed = trimLeadingEmptyWeeks(buildWeeklyVolume(early, { weeks: 12, today: TODAY }))
    expect(trimmed[0]!.weekStart).toBe('2026-08-17')
    expect(trimmed).toHaveLength(7)

    const none = buildWeeklyVolume([], { weeks: 12, today: TODAY })
    expect(trimLeadingEmptyWeeks(none)).toHaveLength(12)
  })

  it('ignores missing or negative durations and distances', () => {
    const weeks = buildWeeklyVolume(
      [{ date: '2026-10-02T06:00:00Z', type: 'Run', durationSec: null, distanceMeters: -5 }],
      { weeks: 1, today: TODAY }
    )
    expect(weeks[0]).toMatchObject({ sessions: 1, durationSec: 0, distanceMeters: 0 })
  })
})

describe('sessionsPerWeek', () => {
  it('counts sessions over a rolling window ending today', () => {
    const workouts = Array.from({ length: 25 }, (_, i) => ({
      date: `${addDaysToKey('2026-10-04', -i)}T06:00:00Z`
    }))
    // Plus one session just outside a 42-day window.
    workouts.push({ date: `${addDaysToKey('2026-10-04', -42)}T06:00:00Z` })
    const rate = sessionsPerWeek(workouts, { days: 42, today: TODAY, timeZone: 'UTC' })
    expect(rate).toEqual({ sessions: 25, weeks: 6, perWeek: 4.2 })
  })
})

describe('hasPowerData', () => {
  it('detects power from workouts or power personal bests', () => {
    expect(hasPowerData([{ date: TODAY, averageWatts: null }])).toBe(false)
    expect(hasPowerData([{ date: TODAY, averageWatts: 0 }])).toBe(false)
    expect(hasPowerData([{ date: TODAY, averageWatts: 210 }])).toBe(true)
    expect(hasPowerData([], [{ type: 'RUN_5K', unit: 's' }])).toBe(false)
    expect(hasPowerData([], [{ type: 'POWER_20M', unit: 'W' }])).toBe(true)
  })
})

describe('computeFitnessTrend', () => {
  const series = (start: number, end: number) => [
    { date: '2026-08-23T00:00:00.000Z', ctl: start },
    { date: '2026-09-10T00:00:00.000Z', ctl: (start + end) / 2 },
    { date: '2026-10-04T00:00:00.000Z', ctl: end }
  ]

  it('reports a percentage change over the window', () => {
    expect(computeFitnessTrend(series(40, 44.8))).toMatchObject({
      kind: 'up',
      changePct: 12,
      weeks: 6
    })
    expect(computeFitnessTrend(series(50, 45))).toMatchObject({ kind: 'down', changePct: -10 })
    expect(computeFitnessTrend(series(50, 51))).toMatchObject({ kind: 'steady', changePct: 2 })
  })

  it('prefers the current CTL from the summary over the last point', () => {
    expect(computeFitnessTrend(series(40, 40), { currentCtl: 48 })).toMatchObject({
      kind: 'up',
      end: 48,
      changePct: 20
    })
  })

  it('calls it building when there is no meaningful baseline', () => {
    expect(computeFitnessTrend(series(0.4, 31))).toMatchObject({
      kind: 'building',
      changePct: null
    })
  })

  it('returns none without data or training load', () => {
    expect(computeFitnessTrend([]).kind).toBe('none')
    expect(computeFitnessTrend(series(0, 0)).kind).toBe('none')
    expect(computeFitnessTrend(series(3, 2)).kind).toBe('none')
  })
})

describe('classifyForm', () => {
  it('maps TSB onto the same bands as the server form status', () => {
    expect(classifyForm(30)).toBe('very_fresh')
    expect(classifyForm(10)).toBe('fresh')
    expect(classifyForm(5)).toBe('neutral')
    expect(classifyForm(-8)).toBe('neutral')
    expect(classifyForm(-10)).toBe('tired')
    expect(classifyForm(-24)).toBe('tired')
    expect(classifyForm(-30)).toBe('very_tired')
    expect(classifyForm(-45)).toBe('overreached')
    expect(classifyForm(null)).toBeNull()
    expect(classifyForm(Number.NaN)).toBeNull()
  })
})

describe('intensity split', () => {
  const weeks = [
    { hrZones: [2, 4, 1, 0.5, 0.5], powerZones: [0, 0, 0, 0, 0] },
    { hrZones: [1, 1, 0, 0, 0], powerZones: [0, 0, 0, 0, 0] }
  ]

  it('splits zone time into easy (Z1–2), moderate (Z3) and hard (Z4+)', () => {
    const split = computeIntensitySplit(weeks, 'hr')
    expect(split).toEqual({
      source: 'hr',
      easyPct: 80,
      moderatePct: 10,
      hardPct: 10,
      totalHours: 10
    })
    expect(intensityVerdict(split!)).toBe('polarised')
  })

  it('falls back to the source that has data', () => {
    expect(zoneSourcesWithData(weeks)).toEqual(['hr'])
    expect(computeIntensitySplit(weeks, 'power')?.source).toBe('hr')
  })

  it('returns null when no zone time was recorded', () => {
    expect(computeIntensitySplit([{ hrZones: [0, 0], powerZones: [0, 0] }])).toBeNull()
    expect(computeIntensitySplit([])).toBeNull()
  })

  it('judges the split against ~80/20', () => {
    const base = { source: 'hr' as const, moderatePct: 0, totalHours: 1 }
    expect(intensityVerdict({ ...base, easyPct: 70, hardPct: 30 })).toBe('close')
    expect(intensityVerdict({ ...base, easyPct: 50, hardPct: 50 })).toBe('too_hard')
  })
})

describe('goals', () => {
  const today = '2026-10-04'

  it('counts down to the event date, next linked event or target date', () => {
    expect(goalTargetKey({ id: 'a', eventDate: '2026-12-13T00:00:00.000Z' }, today)).toBe(
      '2026-12-13'
    )
    expect(
      goalTargetKey(
        {
          id: 'b',
          events: [
            { date: '2026-09-01T00:00:00.000Z' },
            { date: '2026-11-01T00:00:00.000Z' },
            { date: '2026-10-20T00:00:00.000Z' }
          ]
        },
        today
      )
    ).toBe('2026-10-20')
    expect(goalTargetKey({ id: 'c', events: [{ date: '2026-09-01T00:00:00.000Z' }] }, today)).toBe(
      '2026-09-01'
    )
    expect(goalTargetKey({ id: 'd', targetDate: '2027-01-01T00:00:00.000Z' }, today)).toBe(
      '2027-01-01'
    )
    expect(goalTargetKey({ id: 'e' }, today)).toBeNull()
  })

  it('describes the countdown in weeks, then days', () => {
    expect(describeCountdown(70)).toEqual({ kind: 'weeks', value: 10 })
    expect(describeCountdown(14)).toEqual({ kind: 'weeks', value: 2 })
    expect(describeCountdown(13)).toEqual({ kind: 'days', value: 13 })
    expect(describeCountdown(1)).toEqual({ kind: 'tomorrow', value: 1 })
    expect(describeCountdown(0)).toEqual({ kind: 'today', value: 0 })
    expect(describeCountdown(-3)).toEqual({ kind: 'past', value: 3 })
  })

  it('computes progress for measurable goals in either direction', () => {
    expect(goalProgressPct({ id: 'w', startValue: 80, currentValue: 77, targetValue: 75 })).toBe(60)
    expect(goalProgressPct({ id: 'f', startValue: 250, currentValue: 240, targetValue: 270 })).toBe(
      0
    )
    expect(goalProgressPct({ id: 'g', startValue: 250, currentValue: 300, targetValue: 270 })).toBe(
      100
    )
    expect(goalProgressPct({ id: 'h', startValue: null, currentValue: 1, targetValue: 2 })).toBe(
      null
    )
  })

  it('sorts active goals: upcoming soonest first, then passed, then undated', () => {
    const sorted = upcomingGoals(
      [
        { id: 'undated', status: 'ACTIVE' },
        { id: 'far', status: 'ACTIVE', targetDate: '2027-03-01T00:00:00.000Z' },
        { id: 'done', status: 'COMPLETED', targetDate: '2026-10-10T00:00:00.000Z' },
        { id: 'past', status: 'ACTIVE', targetDate: '2026-09-01T00:00:00.000Z' },
        { id: 'soon', status: 'ACTIVE', eventDate: '2026-12-13T00:00:00.000Z' }
      ],
      today
    )
    expect(sorted.map((entry) => entry.goal.id)).toEqual(['soon', 'far', 'past', 'undated'])
    expect(sorted[0]!.daysLeft).toBe(70)
    expect(sorted[3]!.daysLeft).toBeNull()
  })
})

describe('resolveSectionVisibility', () => {
  it('defaults every section to visible and honours stored opt-outs', () => {
    const resolved = resolveSectionVisibility({
      pmc: { visible: false },
      highlights: { visible: false }, // retired section key
      ftp: {}
    })
    expect(resolved.pmc.visible).toBe(false)
    expect(resolved.ftp.visible).toBe(true)
    expect(resolved.goals.visible).toBe(true)
    expect('highlights' in resolved).toBe(false)
    expect(resolveSectionVisibility(null).volume.visible).toBe(true)
  })
})
