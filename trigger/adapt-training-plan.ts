import {
  validatePrescriptionWrite,
  withPrescriptionAssessment
} from '../server/utils/training-prescription/service'
import './init'
import { createHash, randomUUID } from 'node:crypto'
import { logger, task } from '@trigger.dev/sdk/v3'
import type { Prisma, TrainingPlanAdaptation } from '@prisma/client'
import { prisma } from '../server/utils/db'
import { userReportsQueue } from './queues'
import {
  formatDateUTC,
  getUserLocalDate,
  getStartOfLocalDateUTC,
  getEndOfDayUTC
} from '../server/utils/date'
import { runGenerateWeeklyPlan } from './generate-weekly-plan'
import {
  buildRecalculationContext,
  planAdaptationSchema,
  scheduleFingerprint,
  validateRecalculationProposal,
  type AdaptationOutcome
} from '../server/utils/plans/week-recalculation'
import { normalizeGeneratedWorkoutType } from '../server/utils/plans/workout-type'
import { dispatchTask } from '../server/utils/task-dispatcher'
import { publishTaskRunStartedEvent } from '../server/utils/task-run-events'
import { registerTaskHandler } from '../server/utils/task-registry'
import { isIntervalsEventId } from '../server/utils/intervals'

type AdaptationPayload = {
  planId: string
  userId: string
  adaptationType: string
  requestId?: string
  context?: string
  anchorWorkoutIds?: string[]
}

async function loadSnapshot(db: Prisma.TransactionClient, payload: AdaptationPayload) {
  const plan = await db.trainingPlan.findUnique({
    where: { id: payload.planId },
    include: { blocks: { orderBy: { id: 'asc' }, include: { weeks: { orderBy: { id: 'asc' } } } } }
  })
  if (!plan || plan.userId !== payload.userId || plan.isTemplate) return null
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { timezone: true }
  })
  const timezone = user?.timezone || 'UTC'
  const today = formatDateUTC(getUserLocalDate(timezone))
  const week =
    plan.status === 'ACTIVE'
      ? plan.blocks
          .flatMap((block) => block.weeks)
          .find((w) => formatDateUTC(w.startDate) <= today && formatDateUTC(w.endDate) >= today)
      : undefined
  if (!week) return { plan, week: null, timezone, today }
  const start = new Date(`${formatDateUTC(week.startDate)}T00:00:00Z`)
  const end = new Date(`${formatDateUTC(week.endDate)}T00:00:00Z`)
  const [workouts, completed, availability] = await Promise.all([
    db.plannedWorkout.findMany({
      where: {
        userId: payload.userId,
        OR: [{ date: { gte: start, lte: end } }, { trainingWeekId: week.id }]
      },
      orderBy: { id: 'asc' }
    }),
    db.workout.findMany({
      where: {
        userId: payload.userId,
        isDuplicate: false,
        date: {
          gte: getStartOfLocalDateUTC(timezone, formatDateUTC(start)),
          lte: getEndOfDayUTC(timezone, getStartOfLocalDateUTC(timezone, formatDateUTC(end)))
        }
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        date: true,
        durationSec: true,
        type: true,
        tss: true,
        plannedWorkoutId: true,
        updatedAt: true
      }
    }),
    db.trainingAvailability.findMany({ where: { userId: payload.userId }, orderBy: { id: 'asc' } })
  ])
  return { plan, week, timezone, today, workouts, completed, availability }
}

async function queueFollowUps(receipt: TrainingPlanAdaptation): Promise<AdaptationOutcome> {
  if (!receipt.followUpsQueued) {
    try {
      const output = receipt.output as AdaptationOutcome
      if (output.remoteCleanupCount) {
        const key = createHash('sha256').update(receipt.requestId).digest('hex')
        await dispatchTask(
          'process-sync-queue',
          {},
          {
            id: `adapt_cleanup_${key}`,
            idempotencyKey: `adapt_cleanup_${key}`,
            tags: [`user:${receipt.userId}`, `plan:${receipt.planId}`]
          }
        )
      }
      const workouts = await prisma.plannedWorkout.findMany({
        where: { userId: receipt.userId, id: { in: receipt.workoutIds } }
      })
      for (const workout of workouts) {
        if (
          workout.type === 'Rest' ||
          workout.completed ||
          workout.structuredWorkout ||
          workout.generationRevision !== 1 ||
          workout.modifiedLocally ||
          workout.managedBy !== 'COACH_WATTS'
        )
          continue
        const key = createHash('sha256').update(`${receipt.requestId}:${workout.id}`).digest('hex')
        const tags = [
          `user:${receipt.userId}`,
          `planned-workout:${workout.id}`,
          `plan:${receipt.planId}`
        ]
        // The structure task publishes to enabled integrations after saving its structure.
        // A stable dispatch key makes retries after a partial enqueue safe.
        const handle = await dispatchTask(
          'generate-structured-workout',
          {
            plannedWorkoutId: workout.id,
            generationRevision: 1,
            generationRunId: `adapt_${key}`
          },
          {
            id: `adapt_${key}`,
            idempotencyKey: `adapt_${key}`,
            tags,
            concurrencyKey: receipt.userId
          }
        )
        await prisma.workoutStructureGenerationRun.update({
          where: { id: `adapt_${key}` },
          data: { triggerRunId: handle.id }
        })
        await publishTaskRunStartedEvent(receipt.userId, 'generate-structured-workout', handle, {
          tags
        })
      }
      await prisma.trainingPlanAdaptation.update({
        where: { requestId: receipt.requestId },
        data: { followUpsQueued: true, followUpError: null }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await prisma.trainingPlanAdaptation.update({
        where: { requestId: receipt.requestId },
        data: { followUpError: message }
      })
      throw new Error(
        `Replacements were saved, but workout design could not be queued: ${message}. Retrying resumes dispatch without replacing the schedule again.`,
        { cause: error }
      )
    }
  }
  return receipt.output as AdaptationOutcome
}

export async function runAdaptTrainingPlan(
  payload: AdaptationPayload,
  context?: { runId?: string }
) {
  const requestId = payload.requestId || context?.runId || randomUUID()
  const outcome = (
    status: AdaptationOutcome['outcome'],
    reason: string,
    message: string
  ): AdaptationOutcome => ({
    success: status !== 'failed',
    outcome: status,
    reason,
    message,
    planId: payload.planId,
    requestId
  })
  if (payload.adaptationType !== 'RECALCULATE_WEEK') {
    return outcome('failed', 'UNSUPPORTED_ADAPTATION', 'Only weekly recalculation is supported.')
  }
  const parsed = planAdaptationSchema.safeParse(payload)
  if (!parsed.success || !payload.userId)
    return outcome('failed', 'INVALID_REQUEST', 'Invalid adaptation request.')
  payload = { ...payload, ...parsed.data, requestId }

  const snapshot = await loadSnapshot(prisma, payload)
  if (!snapshot) return outcome('failed', 'PLAN_NOT_FOUND', 'Plan not found for this athlete.')
  const prior = await prisma.trainingPlanAdaptation.findUnique({ where: { requestId } })
  if (prior) {
    if (prior.userId !== payload.userId || prior.planId !== payload.planId) {
      return outcome(
        'failed',
        'REQUEST_CONFLICT',
        'This recalculation request belongs to another plan.'
      )
    }
    return queueFollowUps(prior)
  }
  if (!snapshot.week || !('workouts' in snapshot)) {
    return outcome('unchanged', 'NO_ACTIVE_WEEK', 'No active training week to recalculate.')
  }
  const replacement = buildRecalculationContext({
    ...snapshot,
    week: snapshot.week,
    anchorWorkoutIds: parsed.data.anchorWorkoutIds
  })
  if (!replacement.eligibleDays.length) {
    return outcome(
      'unchanged',
      'NO_ELIGIBLE_DAYS',
      'There are no unprotected future days left this week.'
    )
  }
  const fingerprint = scheduleFingerprint(snapshot)
  const generated = await runGenerateWeeklyPlan({
    userId: payload.userId,
    trainingWeekId: snapshot.week.id,
    anchorWorkoutIds: replacement.preserved.map((w) => w.id),
    userInstructions: payload.context,
    proposalOnly: true,
    replacementContext: replacement
  })
  if (!generated.success || !('proposal' in generated)) {
    return outcome(
      'failed',
      'GENERATION_FAILED',
      'Replacement generation did not produce a proposal. Your schedule is unchanged.'
    )
  }
  let proposal: ReturnType<typeof validateRecalculationProposal>
  try {
    proposal = validateRecalculationProposal(generated.proposal, replacement)
  } catch (error) {
    logger.warn('Rejected recalculation proposal', { requestId, error: String(error) })
    return outcome(
      'failed',
      'INVALID_PROPOSAL',
      `Replacement validation failed: ${error instanceof Error ? error.message : String(error)}. Your schedule is unchanged.`
    )
  }

  const workouts = proposal.days.map((day) => ({
    id: randomUUID(),
    userId: payload.userId,
    trainingWeekId: snapshot.week!.id,
    externalId: `ai_gen_adapt_${createHash('sha256').update(`${requestId}:${day.date}`).digest('hex')}`,
    date: new Date(`${day.date}T00:00:00Z`),
    title: day.title,
    description: `${day.description}\n\nReasoning: ${day.reasoningText}`,
    type: normalizeGeneratedWorkoutType(day.workoutType),
    category: 'WORKOUT',
    durationSec: Math.round(day.durationMinutes * 60),
    distanceMeters: day.distanceMeters,
    tss: day.targetTSS,
    workIntensity:
      day.intensity === 'hard'
        ? 0.9
        : day.intensity === 'very_hard'
          ? 1
          : day.intensity === 'moderate'
            ? 0.75
            : day.intensity === 'easy'
              ? 0.6
              : day.intensity === 'recovery'
                ? 0.5
                : null,
    targetArea: day.targetArea,
    managedBy: 'COACH_WATTS',
    syncStatus: 'LOCAL_ONLY',
    generationRevision: 1,
    rawJson: { adaptationRequestId: requestId, weekSummary: proposal.weekSummary }
  }))
  const result: AdaptationOutcome = {
    success: true,
    outcome: 'changed',
    planId: payload.planId,
    requestId,
    createdCount: workouts.length,
    removedCount: replacement.replaceable.length,
    remoteCleanupCount: replacement.replaceable.filter((w) => isIntervalsEventId(w.externalId))
      .length,
    message: 'The remaining week has been recalculated. Protected sessions were preserved.'
  }

  let receipt: TrainingPlanAdaptation | null
  try {
    receipt = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${payload.userId}))::text`
        const alreadyCommitted = await tx.trainingPlanAdaptation.findUnique({
          where: { requestId }
        })
        if (alreadyCommitted) {
          if (
            alreadyCommitted.userId !== payload.userId ||
            alreadyCommitted.planId !== payload.planId
          ) {
            throw new Error('Recalculation request conflict')
          }
          return alreadyCommitted
        }
        const current = await loadSnapshot(tx, payload)
        if (scheduleFingerprint(current) !== fingerprint) return null
        const assessment = await validatePrescriptionWrite(tx, payload.userId, workouts, {
          source: 'weekly-recalculation',
          replaceIds: replacement.replaceable.map((w) => w.id)
        })
        for (const workout of workouts)
          workout.rawJson = withPrescriptionAssessment(
            workout.rawJson,
            assessment.id
          ) as typeof workout.rawJson
        const removed = await tx.plannedWorkout.deleteMany({
          where: { userId: payload.userId, id: { in: replacement.replaceable.map((w) => w.id) } }
        })
        if (removed.count !== replacement.replaceable.length)
          throw new Error('Schedule changed during replacement')
        // Retire old pending exports and durably queue deletion of our published sessions.
        // The queue becomes visible to sync workers only when the replacement commits.
        await tx.syncQueue.updateMany({
          where: {
            userId: payload.userId,
            entityType: 'planned_workout',
            entityId: { in: replacement.replaceable.map((w) => w.id) },
            status: 'PENDING',
            operation: { in: ['CREATE', 'UPDATE'] }
          },
          data: { status: 'SUPERSEDED', completedAt: new Date() }
        })
        const remoteDeletes = replacement.replaceable.filter((w) =>
          isIntervalsEventId(w.externalId)
        )
        if (remoteDeletes.length) {
          await tx.syncQueue.createMany({
            data: remoteDeletes.map((w) => ({
              userId: payload.userId,
              entityType: 'planned_workout',
              entityId: w.id,
              operation: 'DELETE',
              status: 'PENDING',
              structureRevision: null,
              payload: { id: w.id, externalId: w.externalId, date: w.date.toISOString() }
            }))
          })
        }
        await tx.plannedWorkout.createMany({ data: workouts })
        await tx.workoutStructureGenerationRun.createMany({
          data: workouts
            .filter((w) => w.type !== 'Rest')
            .map((w) => ({
              id: `adapt_${createHash('sha256').update(`${requestId}:${w.id}`).digest('hex')}`,
              userId: payload.userId,
              plannedWorkoutId: w.id,
              mode: 'generate',
              source: 'api',
              generationRevision: 1,
              idempotencyKey: `structure-generate:${w.id}:rev-1`,
              status: 'PENDING',
              requestSnapshot: { adaptationRequestId: requestId }
            }))
        })
        return tx.trainingPlanAdaptation.create({
          data: {
            requestId,
            userId: payload.userId,
            planId: payload.planId,
            trainingWeekId: snapshot.week!.id,
            output: result,
            workoutIds: workouts.map((w) => w.id)
          }
        })
      },
      { isolationLevel: 'Serializable', timeout: 15000 }
    )
  } catch (error) {
    if ((error as { code?: string }).code === 'P2034') {
      return outcome(
        'failed',
        'CONCURRENT_EDIT',
        'The schedule changed during recalculation. Refresh and try again.'
      )
    }
    throw error
  }
  if (!receipt)
    return outcome(
      'failed',
      'CONCURRENT_EDIT',
      'The schedule changed during recalculation. Refresh and try again.'
    )
  return queueFollowUps(receipt)
}

registerTaskHandler('adapt-training-plan', runAdaptTrainingPlan)

export const adaptTrainingPlanTask = task({
  id: 'adapt-training-plan',
  queue: userReportsQueue,
  maxDuration: 600,
  run: async (payload: AdaptationPayload, { ctx }) =>
    runAdaptTrainingPlan(payload, { runId: ctx.run.id })
})
