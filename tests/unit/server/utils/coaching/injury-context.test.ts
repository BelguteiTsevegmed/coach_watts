import { describe, expect, it, vi } from 'vitest'

import { prisma } from '../../../../../server/utils/db'
import {
  daysSinceOnset,
  fetchOpenInjuries,
  findInjuryConflicts,
  formatInjuriesForPrompt,
  formatInjuryConflictsForPrompt,
  formatInjuryLine,
  type InjuryPromptInput
} from '../../../../../server/utils/coaching/injury-context'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: { injury: { findMany: vi.fn() } }
}))

const today = new Date('2026-10-04T00:00:00.000Z')

const achilles: InjuryPromptInput = {
  id: 'inj-1',
  bodyArea: 'achilles',
  side: 'LEFT',
  title: 'Achilles tightness',
  painLevel: 5,
  status: 'ACTIVE',
  onsetDate: new Date('2026-09-28T00:00:00.000Z'),
  affectedSports: ['run'],
  notes: 'Sore on the first steps in the morning'
}

const shoulder: InjuryPromptInput = {
  id: 'inj-2',
  bodyArea: 'shoulder',
  side: 'RIGHT',
  painLevel: 2,
  status: 'RECOVERING',
  onsetDate: '2026-09-01T00:00:00.000Z',
  affectedSports: []
}

describe('daysSinceOnset', () => {
  it('counts calendar days between onset and today', () => {
    expect(daysSinceOnset(new Date('2026-09-28T00:00:00.000Z'), today)).toBe(6)
    expect(daysSinceOnset('2026-10-04T00:00:00.000Z', today)).toBe(0)
  })

  it('never goes negative for a future onset', () => {
    expect(daysSinceOnset('2026-10-10T00:00:00.000Z', today)).toBe(0)
  })
})

describe('formatInjuryLine', () => {
  it('includes area, side, pain, status, days since onset, sports and notes', () => {
    const line = formatInjuryLine(achilles, today)
    expect(line).toBe(
      '- Left achilles "Achilles tightness" | pain 5/10 | ACTIVE | since 2026-09-28 (6 days ago) | affects: Running | notes: Sore on the first steps in the morning'
    )
  })

  it('marks affected sports inferred from the body area when none were given', () => {
    const line = formatInjuryLine(shoulder, today)
    expect(line).toContain('Right shoulder')
    expect(line).toContain('pain 2/10 | RECOVERING')
    expect(line).toContain('affects: Swimming, Strength (inferred from body area)')
  })

  it('says "today" for an injury that started today', () => {
    expect(formatInjuryLine({ ...achilles, onsetDate: today }, today)).toContain('(today)')
  })
})

describe('formatInjuriesForPrompt', () => {
  it('reports explicitly when nothing is logged', () => {
    expect(formatInjuriesForPrompt([], { today })).toBe(
      'ACTIVE INJURIES & NIGGLES (logged by the athlete):\n- None logged. If the athlete mentions pain, take it seriously and adapt.'
    )
  })

  it('lists ACTIVE before RECOVERING, skips RESOLVED and appends the pain rules', () => {
    const prompt = formatInjuriesForPrompt(
      [shoulder, { ...achilles, id: 'inj-3', status: 'RESOLVED' }, achilles],
      { today }
    )
    const lines = prompt.split('\n')
    expect(lines[0]).toBe('ACTIVE INJURIES & NIGGLES (logged by the athlete):')
    expect(lines[1]).toContain('Left achilles')
    expect(lines[2]).toContain('Right shoulder')
    expect(prompt.match(/Left achilles/g)).toHaveLength(1)
    expect(prompt).toContain('Injury rules (pain-monitoring model)')
    expect(prompt).toContain('pain >= 4/10')
    expect(prompt).toContain('Never diagnose')
  })

  it('can omit the rules and use a custom heading', () => {
    const prompt = formatInjuriesForPrompt([achilles], {
      today,
      heading: 'Body status',
      includeRules: false
    })
    expect(prompt.startsWith('Body status:\n- Left achilles')).toBe(true)
    expect(prompt).not.toContain('Injury rules')
  })
})

describe('findInjuryConflicts', () => {
  it('flags an ACTIVE injury with pain >= 4 that affects the session sport', () => {
    const conflicts = findInjuryConflicts([achilles], [{ title: 'Easy Run', type: 'Run' }])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ sport: 'run', sessionTitle: 'Easy Run' })
  })

  it('ignores other sports, low pain, recovering injuries and rest days', () => {
    expect(findInjuryConflicts([achilles], [{ title: 'Endurance', type: 'Ride' }])).toEqual([])
    expect(findInjuryConflicts([{ ...achilles, painLevel: 3 }], [{ type: 'Run' }])).toEqual([])
    expect(findInjuryConflicts([{ ...achilles, status: 'RECOVERING' }], [{ type: 'Run' }])).toEqual(
      []
    )
    expect(findInjuryConflicts([achilles], [{ title: 'Rest Day', type: 'Rest' }])).toEqual([])
  })

  it('uses the inferred sports when the athlete did not specify any', () => {
    const knee = { ...achilles, bodyArea: 'knee', affectedSports: [] }
    expect(findInjuryConflicts([knee], [{ type: 'VirtualRide' }])).toHaveLength(1)
  })

  it('formats a MUST-act block that forbids "proceed"', () => {
    const block = formatInjuryConflictsForPrompt(
      findInjuryConflicts([achilles], [{ title: 'Easy Run', type: 'Run' }])
    )
    expect(block).toContain('INJURY CONFLICT — MUST ACT')
    expect(block).toContain('"Easy Run" (Run) loads the left achilles (ACTIVE, pain 5/10)')
    expect(block).toContain('never "proceed"')
    expect(formatInjuryConflictsForPrompt([])).toBe('')
  })
})

describe('fetchOpenInjuries', () => {
  it('queries ACTIVE and RECOVERING injuries for the user', async () => {
    vi.mocked(prisma.injury.findMany).mockResolvedValue([achilles] as any)
    await expect(fetchOpenInjuries('user-1')).resolves.toEqual([achilles])
    expect(prisma.injury.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', status: { in: ['ACTIVE', 'RECOVERING'] } }
      })
    )
  })

  it('never throws — a failure must not block coaching', async () => {
    vi.mocked(prisma.injury.findMany).mockRejectedValue(new Error('db down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(fetchOpenInjuries('user-1')).resolves.toEqual([])
    warn.mockRestore()
  })
})
