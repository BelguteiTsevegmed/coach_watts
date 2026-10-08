import { describe, expect, it } from 'vitest'
import {
  CORE_COACHING_PRINCIPLES,
  CYCLING_PRINCIPLES,
  MULTISPORT_PRINCIPLES,
  RUNNING_PRINCIPLES,
  READINESS_DECISION_PROMPT,
  buildCoachingPrinciples
} from '../../../../../server/utils/coaching/principles'

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

describe('coaching principles', () => {
  it('stays within the token budget (injected into every coach prompt)', () => {
    const all = [
      CORE_COACHING_PRINCIPLES,
      RUNNING_PRINCIPLES,
      READINESS_DECISION_PROMPT,
      CYCLING_PRINCIPLES,
      MULTISPORT_PRINCIPLES
    ]
    expect(words(all.join('\n'))).toBeLessThan(900)
    expect(words(buildCoachingPrinciples('running'))).toBeLessThan(700)
  })

  it('covers the evidence-based essentials', () => {
    const text = CORE_COACHING_PRINCIPLES
    for (const needle of [
      'Polarized',
      'pyramidal',
      'no universal winner',
      'heuristics, not proven safety limits',
      'every 3-4 weeks',
      'Taper',
      '~2x/week',
      'RED-S',
      'own baseline',
      'Low pain is not clearance',
      'next-morning response',
      'Red flags',
      'Never diagnose',
      'graded return',
      'Chest pain',
      '24 hours',
      'Never invent'
    ]) {
      expect(text).toContain(needle)
    }
  })

  it('versions generation prompts and avoids fixed safety or readiness claims', () => {
    const text = buildCoachingPrinciples('cycling')
    expect(text).toContain('Coaching evidence/policy: coaching-evidence-v1 (reviewed 2026-10-08)')
    expect(text).not.toContain('0.8-1.3')
    expect(text).not.toContain('respect the load ratio')
    expect(text).not.toContain('neck check')
    expect(text).toContain(
      'do not establish injury prevention, overtraining diagnosis or race readiness'
    )
    expect(text).toContain('does not establish the cause or prove a training remedy')
  })

  it('keeps recovery score defaults subordinate to contraindications', () => {
    expect(READINESS_DECISION_PROMPT).toContain('Higher scores do not automatically clear')
    expect(READINESS_DECISION_PROMPT).toContain(
      'never overrides illness red flags, injury restrictions or clinician advice'
    )
    expect(READINESS_DECISION_PROMPT).toContain('Missing recovery data remains unknown')
  })

  it('adds the section for the athlete sport', () => {
    expect(buildCoachingPrinciples('running')).toContain('### Running specifics')
    expect(buildCoachingPrinciples('cycling')).toContain('### Cycling specifics')
    expect(buildCoachingPrinciples('multisport')).toContain('### Multisport / general endurance')
    expect(buildCoachingPrinciples('general')).toContain('### Multisport / general endurance')
    expect(buildCoachingPrinciples('running')).not.toContain('### Cycling specifics')
  })
})
