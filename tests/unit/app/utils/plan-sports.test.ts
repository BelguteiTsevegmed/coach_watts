import { describe, expect, it } from 'vitest'
import { activityTypesForGoal } from '../../../../app/utils/plan-sports'

describe('activityTypesForGoal', () => {
  it('maps running goals to Run', () => {
    expect(activityTypesForGoal({ eventType: 'Run', title: 'Sub-1:45 Half Marathon' })).toEqual([
      'Run'
    ])
    expect(activityTypesForGoal({ title: 'First 10k' })).toEqual(['Run'])
    expect(activityTypesForGoal({ title: 'Berlin Marathon' })).toEqual(['Run'])
  })

  it('maps cycling goals to Ride', () => {
    expect(activityTypesForGoal({ eventType: 'Ride', title: 'Etape' })).toEqual(['Ride'])
    expect(activityTypesForGoal({ title: 'Gran Fondo Stelvio' })).toEqual(['Ride'])
  })

  it('maps multisport goals to every discipline', () => {
    expect(activityTypesForGoal({ title: 'Ironman 70.3 Zell am See' })).toEqual([
      'Swim',
      'Ride',
      'Run'
    ])
    expect(activityTypesForGoal({ title: 'Spring duathlon' })).toEqual(['Ride', 'Run'])
  })

  it('returns null when the goal does not name a sport', () => {
    expect(activityTypesForGoal({ title: 'Lose 3 kg' })).toBeNull()
    expect(activityTypesForGoal({ title: '' })).toBeNull()
    expect(activityTypesForGoal(null)).toBeNull()
  })
})
