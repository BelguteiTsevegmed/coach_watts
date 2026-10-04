import { describe, expect, it } from 'vitest'
import {
  formatSleepHours,
  getFormLevel,
  getFormTone,
  getHrvTrend,
  getSleepLevel
} from '../../../../app/utils/readiness'

describe('getFormLevel', () => {
  it('returns null when there is no form value', () => {
    expect(getFormLevel(null)).toBeNull()
    expect(getFormLevel(undefined)).toBeNull()
    expect(getFormLevel(Number.NaN)).toBeNull()
  })

  it('calls a positive balance above +5 fresh', () => {
    expect(getFormLevel(6)).toBe('fresh')
    expect(getFormLevel(25)).toBe('fresh')
  })

  it('treats the -10..+5 band as neutral', () => {
    expect(getFormLevel(5)).toBe('neutral')
    expect(getFormLevel(0)).toBe('neutral')
    expect(getFormLevel(-9)).toBe('neutral')
  })

  it('treats a normal training block (-25..-10) as tired', () => {
    expect(getFormLevel(-10)).toBe('tired')
    expect(getFormLevel(-18)).toBe('tired')
    expect(getFormLevel(-24)).toBe('tired')
  })

  it('flags deep fatigue as very tired', () => {
    expect(getFormLevel(-25)).toBe('very_tired')
    expect(getFormLevel(-40)).toBe('very_tired')
  })

  it('classifies the rounded value so the word matches the number shown', () => {
    // Shown as "+5" -> neutral, not fresh.
    expect(getFormLevel(5.4)).toBe('neutral')
    // Shown as "-10" -> tired.
    expect(getFormLevel(-9.6)).toBe('tired')
  })

  it('maps levels to calm tones', () => {
    expect(getFormTone('fresh')).toBe('success')
    expect(getFormTone('neutral')).toBe('neutral')
    expect(getFormTone('tired')).toBe('warning')
    expect(getFormTone('very_tired')).toBe('error')
    expect(getFormTone(null)).toBe('neutral')
  })
})

describe('getHrvTrend', () => {
  it('needs both a reading and a positive baseline', () => {
    expect(getHrvTrend(null, 60)).toBeNull()
    expect(getHrvTrend(60, null)).toBeNull()
    expect(getHrvTrend(60, 0)).toBeNull()
  })

  it('treats small day-to-day swings as normal', () => {
    expect(getHrvTrend(62, 60)).toEqual({ direction: 'normal', deltaPct: 3 })
    expect(getHrvTrend(57, 60)).toEqual({ direction: 'normal', deltaPct: 5 })
  })

  it('reports meaningful moves above or below baseline', () => {
    expect(getHrvTrend(70, 60)).toEqual({ direction: 'above', deltaPct: 17 })
    expect(getHrvTrend(48, 60)).toEqual({ direction: 'below', deltaPct: 20 })
  })

  it('honours a custom tolerance', () => {
    expect(getHrvTrend(63, 60, 2)).toEqual({ direction: 'above', deltaPct: 5 })
  })
})

describe('sleep helpers', () => {
  it('labels sleep duration in plain language', () => {
    expect(getSleepLevel(null)).toBeNull()
    expect(getSleepLevel(0)).toBeNull()
    expect(getSleepLevel(8)).toBe('good')
    expect(getSleepLevel(7)).toBe('good')
    expect(getSleepLevel(6.5)).toBe('fair')
    expect(getSleepLevel(5.2)).toBe('short')
  })

  it('formats decimal hours as hours and minutes', () => {
    expect(formatSleepHours(7.2)).toBe('7h 12m')
    expect(formatSleepHours(8)).toBe('8h')
    expect(formatSleepHours(0.5)).toBe('30m')
    expect(formatSleepHours(null)).toBeNull()
  })
})
