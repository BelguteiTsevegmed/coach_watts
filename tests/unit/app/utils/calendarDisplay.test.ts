import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ACTIVITY_CALENDAR_SETTINGS,
  formatSessionDistance,
  formatSessionDuration,
  formatSigned,
  getEntryIcon,
  getFormState,
  getSessionIcon,
  getSessionStatus,
  getWeekProgress,
  resolveActivityCalendarSettings
} from '../../../../app/utils/calendarDisplay'

describe('resolveActivityCalendarSettings', () => {
  it('is calm by default: load, wellness and fuel layers are off', () => {
    const settings = resolveActivityCalendarSettings(undefined)

    expect(settings).toEqual(DEFAULT_ACTIVITY_CALENDAR_SETTINGS)
    expect(settings.showTrainingStress).toBe(false)
    expect(settings.showWellness).toBe(false)
    expect(settings.showNutrition).toBe(false)
    expect(settings.showFuelState).toBe(false)
    expect(settings.showSessionDetails).toBe(false)
    expect(settings.showWeekSeparator).toBe(true)
  })

  it('keeps preferences a user stored before the defaults changed', () => {
    // A full object saved by the previous settings modal.
    const settings = resolveActivityCalendarSettings({
      showMetabolicWave: false,
      showFuelState: true,
      showWeekSeparator: true,
      reverseWeekOrder: true,
      alignActivitiesByTime: false,
      showWellness: true,
      showNutrition: true,
      showTrainingStress: true
    })

    expect(settings.showWellness).toBe(true)
    expect(settings.showNutrition).toBe(true)
    expect(settings.showTrainingStress).toBe(true)
    expect(settings.reverseWeekOrder).toBe(true)
    // A key that did not exist back then falls back to its default.
    expect(settings.showSessionDetails).toBe(false)
  })

  it('ignores values that are not booleans', () => {
    const settings = resolveActivityCalendarSettings({ showWellness: 'yes', showFuelState: 1 })

    expect(settings.showWellness).toBe(false)
    expect(settings.showFuelState).toBe(false)
  })

  it('never shows fuel layers when nutrition tracking is off', () => {
    const settings = resolveActivityCalendarSettings(
      { showNutrition: true, showFuelState: true, showMetabolicWave: true, showWellness: true },
      { nutritionEnabled: false }
    )

    expect(settings.showNutrition).toBe(false)
    expect(settings.showFuelState).toBe(false)
    expect(settings.showMetabolicWave).toBe(false)
    expect(settings.showWellness).toBe(true)
  })
})

describe('getSessionStatus', () => {
  it('maps calendar entries to done / planned / missed / rest', () => {
    expect(getSessionStatus({ source: 'completed', status: 'completed', type: 'Run' })).toBe(
      'completed'
    )
    expect(getSessionStatus({ source: 'planned', status: 'completed_plan', type: 'Run' })).toBe(
      'completed'
    )
    expect(getSessionStatus({ source: 'planned', status: 'planned', type: 'Run' })).toBe('planned')
    expect(getSessionStatus({ source: 'planned', status: 'missed', type: 'Run' })).toBe('missed')
    expect(getSessionStatus({ source: 'planned', status: 'completed_plan', type: 'Rest' })).toBe(
      'rest'
    )
    expect(getSessionStatus({ source: 'note', status: 'note' })).toBe('note')
    expect(getSessionStatus({ source: 'goal', status: 'active' })).toBe('milestone')
  })
})

describe('session icons', () => {
  it('uses the sport icon for known and free-form types', () => {
    expect(getSessionIcon('Run')).toBe('i-tabler-run')
    expect(getSessionIcon('WeightTraining')).toBe('i-tabler-barbell')
    expect(getSessionIcon('Indoor cycling')).toBe('i-tabler-bike')
    expect(getSessionIcon(undefined)).toBe('i-tabler-activity')
  })

  it('gives milestones and notes their own icon', () => {
    expect(getEntryIcon({ source: 'goal', priority: 'HIGH' })).toBe('i-heroicons-star-solid')
    expect(getEntryIcon({ source: 'pb' })).toBe('i-heroicons-trophy-solid')
    expect(getEntryIcon({ source: 'note', type: 'Note' })).toBe('i-heroicons-document-text')
    expect(getEntryIcon({ source: 'planned', type: 'Run' })).toBe('i-tabler-run')
  })
})

describe('session formatting', () => {
  it('formats durations in plain hours and minutes', () => {
    expect(formatSessionDuration(3000)).toBe('50m')
    expect(formatSessionDuration(5400)).toBe('1h 30m')
    expect(formatSessionDuration(7200)).toBe('2h')
    expect(formatSessionDuration(0)).toBe('')
    expect(formatSessionDuration(null)).toBe('')
  })

  it('formats distances with one decimal in the athlete units', () => {
    expect(formatSessionDistance(8330)).toBe('8.3 km')
    expect(formatSessionDistance(10000)).toBe('10 km')
    expect(formatSessionDistance(8046.72, 'Miles')).toBe('5 mi')
    expect(formatSessionDistance(0)).toBe('')
  })

  it('formats signed numbers with a real minus sign', () => {
    expect(formatSigned(-7.4)).toBe('−7')
    expect(formatSigned(5)).toBe('+5')
    expect(formatSigned(0)).toBe('0')
  })
})

describe('getWeekProgress', () => {
  it('reports done against done plus still-planned work', () => {
    const progress = getWeekProgress({
      duration: 12600,
      distance: 29800,
      tss: 193,
      plannedDuration: 2520,
      plannedDistance: 6700,
      plannedTss: 33
    })

    expect(progress.doneDuration).toBe(12600)
    expect(progress.totalDuration).toBe(15120)
    expect(progress.totalDistance).toBe(36500)
    expect(progress.totalTss).toBe(226)
    expect(progress.ratio).toBeCloseTo(12600 / 15120)
    expect(progress.hasRemaining).toBe(true)
    expect(progress.isEmpty).toBe(false)
  })

  it('handles a fully planned and an empty week', () => {
    const planned = getWeekProgress({
      duration: 0,
      distance: 0,
      tss: 0,
      plannedDuration: 3600,
      plannedDistance: 0,
      plannedTss: 50
    })
    expect(planned.ratio).toBe(0)
    expect(planned.hasRemaining).toBe(true)

    const empty = getWeekProgress({
      duration: 0,
      distance: 0,
      tss: 0,
      plannedDuration: 0,
      plannedDistance: 0,
      plannedTss: 0
    })
    expect(empty.isEmpty).toBe(true)
    expect(empty.ratio).toBe(0)
  })
})

describe('getFormState', () => {
  it('buckets form into plain-language states', () => {
    expect(getFormState(30)).toBe('detraining')
    expect(getFormState(10)).toBe('fresh')
    expect(getFormState(-7)).toBe('neutral')
    expect(getFormState(-15)).toBe('building')
    expect(getFormState(-30)).toBe('tired')
    expect(getFormState(-45)).toBe('very_tired')
  })
})
