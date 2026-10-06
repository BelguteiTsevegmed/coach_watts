import { describe, expect, it } from 'vitest'
import {
  athletePrimaryNavigation,
  getAthleteArea,
  getAthleteContextNavigation
} from '../../../shared/athlete-navigation'

describe('Athlete journey navigation', () => {
  it('keeps three daily destinations and associates existing deep links with their context', () => {
    expect(athletePrimaryNavigation.map(({ to }) => to)).toEqual([
      '/dashboard',
      '/activities',
      '/performance'
    ])
    expect(getAthleteArea('/workouts/planned/ride-1?tab=details')).toBe('training')
    expect(getAthleteArea('/plans/template-1')).toBe('training')
    expect(getAthleteArea('/nutrition/2026-10-06')).toBe('today')
    expect(getAthleteArea('/reports/report-1')).toBe('progress')
    expect(getAthleteArea('/injuries')).toBe('today')
    expect(getAthleteArea('/performance/bests')).toBe('progress')
  })

  it('does not misclassify prefix collisions, account pages, or coaching roles', () => {
    for (const path of [
      '/planner',
      '/dashboard-tools',
      '/settings/apps',
      '/coaching/athletes/1',
      '/chat'
    ]) {
      expect(getAthleteArea(path)).toBeNull()
    }
    expect(getAthleteContextNavigation(null)).toEqual([])
  })

  it('retains training depth and progress evidence as context destinations', () => {
    expect(getAthleteContextNavigation('training').map(({ to }) => to)).toEqual([
      '/activities',
      '/plan',
      '/workouts',
      '/library/workouts'
    ])
    expect(getAthleteContextNavigation('progress').map(({ to }) => to)).toEqual([
      '/performance',
      '/fitness',
      '/reports'
    ])
  })
})
