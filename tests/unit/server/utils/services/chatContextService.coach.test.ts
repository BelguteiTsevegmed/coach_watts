import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAthleteContext } from '../../../../../server/utils/services/chatContextService'
import { prisma } from '../../../../../server/utils/db'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    goal: { findMany: vi.fn().mockResolvedValue([]) },
    plannedWorkout: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([])
    },
    workout: { groupBy: vi.fn() },
    injury: { findMany: vi.fn() },
    trainingAvailability: { findMany: vi.fn().mockResolvedValue([]) },
    weeklyTrainingPlan: { findFirst: vi.fn().mockResolvedValue(null) },
    integration: { findUnique: vi.fn().mockResolvedValue(null) },
    calendarNote: { findMany: vi.fn().mockResolvedValue([]) },
    athleteJourneyEvent: { findMany: vi.fn().mockResolvedValue([]) }
  }
}))

vi.mock('../../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getByUserId: vi.fn().mockResolvedValue([]) }
}))
vi.mock('../../../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: { getForUser: vi.fn().mockResolvedValue([]) }
}))
vi.mock('../../../../../server/utils/repositories/nutritionRepository', () => ({
  nutritionRepository: { getForUser: vi.fn().mockResolvedValue([]) }
}))
vi.mock('../../../../../server/utils/repositories/wellnessRepository', () => ({
  wellnessRepository: { getForUser: vi.fn().mockResolvedValue([]) }
}))
vi.mock('../../../../../server/utils/training-metrics', () => ({
  generateTrainingContext: vi.fn().mockResolvedValue({}),
  formatTrainingContextForPrompt: vi.fn().mockReturnValue('Mocked Training Context')
}))

const runnerHistory = [
  { type: 'Run', _sum: { durationSec: 20 * 3600 } },
  { type: 'WeightTraining', _sum: { durationSec: 3 * 3600 } }
]
const cyclistHistory = [{ type: 'Ride', _sum: { durationSec: 25 * 3600 } }]

const CYCLING_SLANG = [
  'Shut up legs',
  'chamois',
  'KOM hunting',
  'stronger rider',
  'cycling fanatic'
]

describe('chat coach persona & body status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(new Date('2026-10-04T09:00:00.000Z'))
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: 'Alex Runner',
      timezone: 'UTC',
      language: 'English',
      aiPersona: 'Analytical'
    } as any)
    vi.mocked(prisma.injury.findMany).mockResolvedValue([])
  })

  it('talks like a running coach to a runner, with no cycling slang', async () => {
    vi.mocked(prisma.workout.groupBy).mockResolvedValue(runnerHistory as any)
    const { systemInstruction, context } = await buildAthleteContext('user-1')

    expect(systemInstruction).toContain("You are Coach Watts, the athlete's personal running coach")
    expect(systemInstruction).toContain('Talk like a running coach')
    expect(systemInstruction).toContain('**Style (Analytical)**')
    expect(systemInstruction).toContain('Address the athlete as **Alex**')
    for (const phrase of CYCLING_SLANG) {
      expect(systemInstruction).not.toContain(phrase)
    }
    expect(context).toContain('**Primary Sport** (from recent training): running')
  })

  it('keeps a cycling voice for cyclists and honors the Drill Sergeant persona safely', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: 'Cleo',
      timezone: 'UTC',
      aiPersona: 'Drill Sergeant'
    } as any)
    vi.mocked(prisma.workout.groupBy).mockResolvedValue(cyclistHistory as any)
    const { systemInstruction } = await buildAthleteContext('user-1')

    expect(systemInstruction).toContain('personal cycling coach')
    expect(systemInstruction).toContain('never on pain, injury or illness')
    expect(systemInstruction).toContain('### Cycling specifics')
  })

  it('injects the shared principles and keeps the tool/date/unit instructions', async () => {
    vi.mocked(prisma.workout.groupBy).mockResolvedValue(runnerHistory as any)
    const { systemInstruction } = await buildAthleteContext('user-1')

    expect(systemInstruction).toContain('## Coaching Principles')
    expect(systemInstruction).toContain('### Running specifics')
    expect(systemInstruction).toContain('## Tool Usage & Agency (CRITICAL)')
    expect(systemInstruction).toContain('## Unit & Format Preferences (CRITICAL)')
    expect(systemInstruction).toContain('## Date Context')
    expect(systemInstruction).toContain('`log_injury`')
    expect(systemInstruction).toContain('`update_injury`')
  })

  it('lists active injuries (with IDs for update_injury) in the athlete context', async () => {
    vi.mocked(prisma.workout.groupBy).mockResolvedValue(runnerHistory as any)
    vi.mocked(prisma.injury.findMany).mockResolvedValue([
      {
        id: 'inj-1',
        bodyArea: 'achilles',
        side: 'LEFT',
        title: 'Achilles tightness',
        description: null,
        painLevel: 5,
        status: 'ACTIVE',
        onsetDate: new Date('2026-09-28T00:00:00.000Z'),
        affectedSports: ['run'],
        notes: null
      }
    ] as any)
    const { context } = await buildAthleteContext('user-1')

    expect(context).toContain('## Injuries & Niggles')
    expect(context).toContain(
      '- Left achilles "Achilles tightness" | pain 5/10 | ACTIVE | since 2026-09-28 (6 days ago) | affects: Running'
    )
    expect(context).toContain('Injury ID for tools: inj-1 (achilles)')
    expect(context).toContain('Injury rules (pain-monitoring model)')
  })

  it('says so when no injuries are logged', async () => {
    vi.mocked(prisma.workout.groupBy).mockResolvedValue(runnerHistory as any)
    const { context } = await buildAthleteContext('user-1')
    expect(context).toContain('- None logged.')
  })
})
