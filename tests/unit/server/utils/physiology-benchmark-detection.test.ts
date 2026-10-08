import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ profile: {} as any, workouts: [] as any[] }))
vi.mock('../../../../server/utils/auth-guard', () => ({
  requireAuth: async () => ({ id: 'athlete-1' })
}))
vi.mock('../../../../server/utils/repositories/workoutStreamRepository', () => ({
  attachStreamsToWorkouts: async (workouts: any[]) => workouts,
  workoutStreamRepository: { findByWorkoutId: vi.fn() }
}))
vi.mock('../../../../server/utils/notifications', () => ({ createUserNotification: vi.fn() }))
vi.mock('../../../../server/utils/workout-insight-email', () => ({
  queueThresholdUpdateEmail: vi.fn()
}))
vi.mock('@trigger.dev/sdk/v3', () => ({ logger: { log: vi.fn(), warn: vi.fn() } }))
vi.mock('../../../../server/utils/db', () => ({ prisma: {} }))

let handler: (event: any) => Promise<any>
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: any) => fn)
  vi.stubGlobal('getRouterParam', () => 'profile-1')
  vi.stubGlobal('getQuery', () => ({}))
  vi.stubGlobal('prisma', {
    sportSettings: { findFirst: async () => io.profile },
    workout: { findMany: async () => io.workouts }
  })
  handler = (
    await import('../../../../server/api/profile/sport-settings/[id]/detect-from-workouts.post')
  ).default as any
}, 180000)
beforeEach(() => {
  io.profile = {
    id: 'profile-1',
    name: 'Running',
    types: ['Run'],
    ftp: null,
    lthr: null,
    maxHr: null,
    thresholdPace: null
  }
  const time = Array.from({ length: 3601 }, (_, index) => index)
  io.workouts = [
    {
      id: 'workout-1',
      userId: 'athlete-1',
      title: 'Easy run',
      date: new Date(),
      type: 'Run',
      durationSec: 3600,
      streams: {
        time,
        watts: time.map(() => 200),
        heartrate: time.map(() => 105),
        velocity: time.map(() => 2.5)
      }
    }
  ]
})
describe('qualified calibration candidates on the profile page', () => {
  it('does not qualify first estimates with stale HR evidence', async () => {
    io.profile.lthr = 170
    io.profile.zoneConfiguration = {
      physiologyReferences: {
        lthr: { value: 170, status: 'measured', measuredAt: '2025-01-01', sport: 'run' }
      }
    }
    io.workouts[0].streams.heartrate.fill(170)
    const result = await handler({})
    expect(result.detections.ftp.detected).toBe(false)
    expect(result.detections.thresholdPace.detected).toBe(false)
  })
  it('does not infer first thresholds or max HR from an ordinary easy workout', async () => {
    const result = await handler({})
    expect(result.detectedAny).toBe(false)
    for (const detection of Object.values(result.detections) as any[])
      expect(detection.newValue).toBeNull()
  })
  it('accepts power corroborated by a known threshold HR and marks it estimated', async () => {
    io.profile.lthr = 170
    io.workouts[0].streams.heartrate.fill(170)
    const result = await handler({})
    expect(result.detections.ftp).toMatchObject({
      detected: true,
      newValue: 190,
      referenceKind: 'estimated',
      evidenceQualified: true
    })
    expect(result.detections.ftp.source.workoutId).toBe('workout-1')
  })
  it('accepts running pace corroborated by a known threshold HR', async () => {
    io.profile.lthr = 170
    io.workouts[0].streams.heartrate.fill(170)
    const result = await handler({})
    expect(result.detections.thresholdPace).toMatchObject({
      detected: true,
      newValue: 2.5,
      referenceKind: 'estimated',
      evidenceQualified: true
    })
  })
})
