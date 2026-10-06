import { describe, expect, it } from 'vitest'
import {
  formatInjuryLocation,
  getEffectiveAffectedSports,
  getPainBand,
  normalizeInjuryBodyArea
} from '../../../shared/injuries'

describe('normalizeInjuryBodyArea', () => {
  it.each([
    ['knee', 'knee'],
    ['Knee', 'knee'],
    ['IT band', 'it_band'],
    ['ITB', 'it_band'],
    ['it-band', 'it_band'],
    ['left achilles tendon', 'achilles'],
    ['plantar fascia', 'foot'],
    ['heel', 'foot'],
    ['shin splints', 'shin'],
    ['calves', 'calf'],
    ['Lower-Back', 'lower_back'],
    ['back', 'lower_back'],
    ['upper back', 'upper_back'],
    ['hip flexor', 'hip'],
    ['Quads', 'quad'],
    ['hamstrings', 'hamstring'],
    ['pinky toe', 'foot'],
    ['ear', 'other']
  ])('%s -> %s', (input, key) => {
    expect(normalizeInjuryBodyArea(input)).toBe(key)
  })

  it('passes non-strings through so validation can reject them', () => {
    expect(normalizeInjuryBodyArea(42)).toBe(42)
    expect(normalizeInjuryBodyArea(undefined)).toBe(undefined)
  })
})

describe('getEffectiveAffectedSports', () => {
  it('uses the athlete selection when present', () => {
    expect(getEffectiveAffectedSports({ bodyArea: 'knee', affectedSports: ['ride'] })).toEqual({
      sports: ['ride'],
      inferred: false
    })
  })

  it('infers sensible defaults from the body area', () => {
    expect(getEffectiveAffectedSports({ bodyArea: 'achilles', affectedSports: [] })).toEqual({
      sports: ['run'],
      inferred: true
    })
    expect(getEffectiveAffectedSports({ bodyArea: 'shoulder' }).sports).toEqual([
      'swim',
      'strength'
    ])
  })
})

describe('formatting helpers', () => {
  it('formats location and pain bands', () => {
    expect(formatInjuryLocation('it_band', 'RIGHT')).toBe('Right it band')
    expect(formatInjuryLocation('calf', 'BOTH')).toBe('Calf (both sides)')
    expect(formatInjuryLocation('neck', null)).toBe('Neck')
    expect([0, 2, 3, 4, 6, 7, 10].map(getPainBand)).toEqual([
      'none',
      'mild',
      'mild',
      'moderate',
      'moderate',
      'severe',
      'severe'
    ])
  })
})
