import { withPrescriptionPublication } from '../../server/utils/training-prescription/publication'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../server/utils/db'
import { plannedWorkoutRepository } from '../../server/utils/repositories/plannedWorkoutRepository'
import {
  loadPrescriptionSnapshot,
  validatePrescriptionWrite
} from '../../server/utils/training-prescription/service'
import { applyPrescriptionTemplate } from '../../server/utils/training-prescription/template-application'
import {
  persistIntervalsPlannedWorkoutImport,
  writeCanonicalPlannedWorkoutStructure
} from '../../server/utils/canonical-planned-workout-write'
vi.mock('../../server/utils/activity-realtime', () => ({ publishActivityEvent: async () => {} }))
vi.mock('../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getForActivityType: async () => ({}) }
}))

const userId = randomUUID()
const date = new Date()
date.setUTCHours(0, 0, 0, 0)
const day = (offset: number) => {
  const value = new Date(date)
  value.setUTCDate(value.getUTCDate() + offset)
  return value
}
const draft = (extra: any = {}) => ({
  userId,
  date: day(1),
  externalId: randomUUID(),
  title: 'Easy run',
  type: 'Run',
  durationSec: 1200,
  workIntensity: 0.6,
  managedBy: 'COACH_WATTS',
  syncStatus: 'LOCAL_ONLY',
  ...extra
})
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.startsWith('/watts_wt_'))
    throw new Error('Integration tests require the isolated worktree database')
  await prisma.user.create({
    data: { id: userId, email: `prescription-${userId}@example.test`, timezone: 'UTC' }
  })
})
afterAll(async () => {
  await prisma.syncQueue.deleteMany({ where: { userId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})
beforeEach(async () => {
  await prisma.syncQueue.deleteMany({ where: { userId } })
  await prisma.workout.deleteMany({ where: { userId } })
  await prisma.plannedWorkout.deleteMany({ where: { userId } })
  await prisma.injury.deleteMany({ where: { userId } })
  await prisma.trainingAvailability.deleteMany({ where: { userId } })
  await prisma.trainingPrescriptionAssessment.deleteMany({ where: { userId } })
})

describe('prescription write boundaries against PostgreSQL', () => {
  it('requires captured structure and start-time revisions before sending', async () => {
    const existing = await plannedWorkoutRepository.create(draft({ startTime: '08:00' }))
    await writeCanonicalPlannedWorkoutStructure({
      plannedWorkoutId: existing.id,
      source: 'MANUAL_EDIT',
      structure: { steps: [{ duration: 1200, rpe: 3 }] },
      workoutType: 'Run'
    })
    const current = await prisma.plannedWorkout.findUniqueOrThrow({ where: { id: existing.id } })
    const send = vi.fn(async () => {})
    await expect(
      withPrescriptionPublication(userId, { ...current, structureRevision: undefined }, send)
    ).rejects.toMatchObject({ statusCode: 409 })
    await plannedWorkoutRepository.update(existing.id, userId, { startTime: '09:00' })
    await expect(withPrescriptionPublication(userId, current, send)).rejects.toMatchObject({
      statusCode: 409
    })
    expect(send).not.toHaveBeenCalled()
  })
  it('serializes deletion after publication and retires the committed remote event', async () => {
    const existing = await plannedWorkoutRepository.create(draft())
    await writeCanonicalPlannedWorkoutStructure({
      plannedWorkoutId: existing.id,
      source: 'MANUAL_EDIT',
      structure: { steps: [{ duration: 1200, rpe: 3 }] },
      workoutType: 'Run'
    })
    const current = await prisma.plannedWorkout.findUniqueOrThrow({ where: { id: existing.id } })
    let started!: () => void
    const publishing = new Promise<void>((resolve) => {
      started = resolve
    })
    let release!: () => void
    const finish = new Promise<void>((resolve) => {
      release = resolve
    })
    const published = withPrescriptionPublication(userId, current, async (_workout, tx) => {
      started()
      await finish
      await tx.plannedWorkout.update({
        where: { id: existing.id },
        data: { externalId: '987654321' }
      })
    })
    await publishing
    const deleted = plannedWorkoutRepository.delete(existing.id, userId)
    release()
    await Promise.all([published, deleted])
    expect(await prisma.plannedWorkout.count({ where: { id: existing.id } })).toBe(0)
    expect(
      await prisma.syncQueue.findFirst({
        where: { userId, entityId: existing.id, operation: 'DELETE' }
      })
    ).toMatchObject({ payload: { externalId: '987654321' } })
  })

  it('rejects scalar edits that would understate the retained canonical interval dose', async () => {
    const existing = await plannedWorkoutRepository.create(draft())
    await writeCanonicalPlannedWorkoutStructure({
      plannedWorkoutId: existing.id,
      source: 'MANUAL_EDIT',
      structure: { steps: [{ duration: 1200, rpe: 3 }] },
      workoutType: 'Run'
    })
    await expect(
      plannedWorkoutRepository.update(existing.id, userId, { durationSec: 600 })
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(
      (await prisma.plannedWorkout.findUniqueOrThrow({ where: { id: existing.id } })).durationSec
    ).toBe(1200)
  })
  it('never calls the outgoing send for an unresolved shell or stale revision', async () => {
    const existing = await plannedWorkoutRepository.create(draft())
    let sends = 0
    await expect(
      withPrescriptionPublication(userId, existing, async () => ++sends)
    ).rejects.toMatchObject({ statusCode: 422 })
    await writeCanonicalPlannedWorkoutStructure({
      plannedWorkoutId: existing.id,
      source: 'MANUAL_EDIT',
      structure: { steps: [{ duration: 1200, rpe: 3 }] },
      workoutType: 'Run'
    })
    await expect(
      withPrescriptionPublication(userId, existing, async () => ++sends)
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(sends).toBe(0)
    const current = await prisma.plannedWorkout.findUniqueOrThrow({ where: { id: existing.id } })
    await withPrescriptionPublication(userId, current, async () => ++sends)
    expect(sends).toBe(1)
  })
  it('keeps imported provider totals and attaches its committed assessment to the actual import ID', async () => {
    const imported = {
      userId,
      externalId: '123456789',
      date: day(1),
      title: 'External long run',
      type: 'Run',
      durationSec: 18000,
      distanceMeters: 40000,
      tss: 300,
      managedBy: 'USER',
      rawJson: { provider: 'intervals' }
    }
    await persistIntervalsPlannedWorkoutImport(prisma, {
      userId,
      existingRecord: null,
      normalizedPlanned: imported,
      sportSettings: {},
      seenAt: new Date()
    })
    const record = await prisma.plannedWorkout.findUniqueOrThrow({
      where: { userId_externalId: { userId, externalId: imported.externalId } }
    })
    expect(record.durationSec).toBe(18000)
    expect(record.distanceMeters).toBe(40000)
    expect(record.tss).toBe(300)
    const receipt = await prisma.trainingPrescriptionAssessment.findFirstOrThrow({
      where: { userId, sessionIds: { has: record.id } }
    })
    expect(receipt.outcome).toBe('warn')
    expect(record.rawJson).toMatchObject({
      provider: 'intervals',
      prescriptionAssessmentId: receipt.id
    })
  })
  it('does not delete an imported provider-owned workout when replacing a template', async () => {
    const external = await prisma.plannedWorkout.create({
      data: draft({ externalId: '123456789', managedBy: 'USER', durationSec: 600 })
    })
    await applyPrescriptionTemplate(userId, [draft({ durationSec: 600 })], date)
    expect(await prisma.plannedWorkout.count({ where: { userId, id: external.id } })).toBe(1)
    expect(await prisma.syncQueue.count({ where: { userId, operation: 'DELETE' } })).toBe(0)
  })

  it('rejects the same oversized running dose for standalone create and final canonical write', async () => {
    await expect(
      plannedWorkoutRepository.create(draft({ durationSec: 7200 }))
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(await prisma.plannedWorkout.count({ where: { userId } })).toBe(0)
    const existing = await plannedWorkoutRepository.create(draft())
    await expect(
      writeCanonicalPlannedWorkoutStructure({
        plannedWorkoutId: existing.id,
        source: 'MANUAL_EDIT',
        structure: { steps: [{ duration: 7200, rpe: 3 }] },
        workoutType: 'Run'
      })
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(
      (await prisma.plannedWorkout.findUniqueOrThrow({ where: { id: existing.id } })).durationSec
    ).toBe(1200)
    const receipts = await prisma.trainingPrescriptionAssessment.findMany({ where: { userId } })
    expect(receipts.filter((r) => r.outcome === 'adjust')).toHaveLength(2)
  })
  it('rolls back a rejected replacement and keeps its durable rejection assessment', async () => {
    const old = await plannedWorkoutRepository.create(draft())
    await expect(
      prisma.$transaction(async (tx) => {
        await validatePrescriptionWrite(tx, userId, [draft({ durationSec: 10800 })], {
          source: 'weekly-generation',
          replaceIds: [old.id]
        })
        await tx.plannedWorkout.deleteMany({ where: { userId } })
        await tx.plannedWorkout.create({ data: draft({ durationSec: 10800 }) })
      })
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(await prisma.plannedWorkout.count({ where: { userId, id: old.id } })).toBe(1)
    expect(
      await prisma.trainingPrescriptionAssessment.count({ where: { userId, outcome: 'adjust' } })
    ).toBe(1)
  })
  it('does not let two concurrent creations consume the same remaining weekly allowance', async () => {
    const results = await Promise.allSettled(
      [0, 1, 2, 3].map((offset) =>
        plannedWorkoutRepository.create(
          draft({
            date: (() => {
              const start = day(7)
              start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) + offset)
              return start
            })(),
            durationSec: 1500
          })
        )
      )
    )
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(2)
    const rows = await prisma.plannedWorkout.findMany({ where: { userId } })
    // Each new week has a 60-minute starter allowance; all four test days must stay inside one week.
    const weeks = new Map<string, number>()
    for (const row of rows) {
      const start = new Date(row.date)
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
      const key = start.toISOString()
      weeks.set(key, (weeks.get(key) || 0) + (row.durationSec || 0) / 60)
    }
    expect([...weeks.values()].every((minutes) => minutes <= 60)).toBe(true)
  })
  it('assesses template batches before deleting ordinary sessions or queuing provider changes', async () => {
    const old = await plannedWorkoutRepository.create(draft({ managedBy: 'USER' }))
    await expect(
      applyPrescriptionTemplate(userId, [draft({ durationSec: 7200 })], date)
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(await prisma.plannedWorkout.count({ where: { userId, id: old.id } })).toBe(1)
    expect(await prisma.syncQueue.count({ where: { userId } })).toBe(0)
  })
  it('preserves locked and completed template sessions while replacing only ordinary sessions', async () => {
    const old = await prisma.plannedWorkout.create({
      data: draft({ managedBy: 'USER', durationSec: 600 })
    })
    const locked = await prisma.plannedWorkout.create({
      data: draft({ date: day(2), durationSec: 600, rawJson: { locked: true } })
    })
    const completed = await prisma.plannedWorkout.create({
      data: draft({
        date: day(0),
        durationSec: 600,
        completed: true,
        completionStatus: 'COMPLETED'
      })
    })
    const result = await applyPrescriptionTemplate(userId, [draft({ durationSec: 600 })], date)
    expect(result.deletedCount).toBe(1)
    expect(
      await prisma.plannedWorkout.count({
        where: { userId, id: { in: [locked.id, completed.id] } }
      })
    ).toBe(2)
    expect(await prisma.plannedWorkout.count({ where: { id: old.id } })).toBe(0)
  })
  it('loads unplanned completed activities using the athlete calendar day and explicit injury restrictions', async () => {
    await prisma.user.update({ where: { id: userId }, data: { timezone: 'America/Los_Angeles' } })
    await prisma.workout.create({
      data: {
        userId,
        externalId: randomUUID(),
        source: 'manual',
        type: 'Run',
        title: 'Extra',
        durationSec: 1800,
        date: new Date(`${day(-1).toISOString().slice(0, 10)}T03:00:00Z`)
      }
    })
    await prisma.injury.create({
      data: {
        userId,
        bodyArea: 'shin',
        painLevel: 1,
        status: 'RECOVERING',
        onsetDate: date,
        affectedSports: ['run'],
        redFlags: ['focal bone tenderness']
      }
    })
    const snapshot = await prisma.$transaction((tx) =>
      loadPrescriptionSnapshot(tx, userId, [draft()])
    )
    expect(snapshot.completed[0]?.date).toBe(day(-2).toISOString().slice(0, 10))
    await expect(plannedWorkoutRepository.create(draft())).rejects.toMatchObject({
      statusCode: 422,
      data: { outcome: 'reject' }
    })
    await prisma.user.update({ where: { id: userId }, data: { timezone: 'UTC' } })
  })
})
