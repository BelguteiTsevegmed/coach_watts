import { describe, expect, it } from 'vitest'
import {
  CORE_COACHING_PRINCIPLES,
  CYCLING_PRINCIPLES,
  MULTISPORT_PRINCIPLES,
  RUNNING_PRINCIPLES,
  buildCoachingPrinciples
} from '../../../../../server/utils/coaching/principles'

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

describe('coaching principles', () => {
  it('stays within the token budget (injected into every coach prompt)', () => {
    const all = [
      CORE_COACHING_PRINCIPLES,
      RUNNING_PRINCIPLES,
      CYCLING_PRINCIPLES,
      MULTISPORT_PRINCIPLES
    ]
    expect(words(all.join('\n'))).toBeLessThan(900)
    expect(words(buildCoachingPrinciples('running'))).toBeLessThan(700)
  })

  it('covers the evidence-based essentials', () => {
    const text = CORE_COACHING_PRINCIPLES
    for (const needle of [
      '75-80%',
      '0.8-1.3',
      'heuristic, not a law',
      'every 3-4 weeks',
      'Taper',
      '~2x/week',
      'RED-S',
      'own baseline',
      'Pain ≤3/10',
      'settles by the next morning',
      'Red flags',
      'Never diagnose',
      'neck check',
      'Never invent'
    ]) {
      expect(text).toContain(needle)
    }
  })

  it('adds the section for the athlete sport', () => {
    expect(buildCoachingPrinciples('running')).toContain('### Running specifics')
    expect(buildCoachingPrinciples('cycling')).toContain('### Cycling specifics')
    expect(buildCoachingPrinciples('multisport')).toContain('### Multisport / general endurance')
    expect(buildCoachingPrinciples('general')).toContain('### Multisport / general endurance')
    expect(buildCoachingPrinciples('running')).not.toContain('### Cycling specifics')
  })
})
