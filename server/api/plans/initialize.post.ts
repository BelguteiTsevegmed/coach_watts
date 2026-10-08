import { prisma } from '../../utils/db'
import { z } from 'zod/v3'
import { requireAuth } from '../../utils/auth-guard'
import { getUserTimezone, getUserLocalDate } from '../../utils/date'

import {
  buildPlanProgression,
  weeklyAvailabilityMinutes
} from '../../utils/plans/progression-policy'
import { trainingPlanRepository } from '../../utils/repositories/trainingPlanRepository'
import {
  getAthletePrimarySport,
  getDefaultActivityTypes,
  inferSportFromText,
  classifySportFamily
} from '../../utils/coaching/sport'
import { baseWeeklyVolumeMinutes } from '../../utils/plans/week-targets'
import {
  buildMacroPlan,
  macroBlocks,
  macroWeekPolicy,
  macroWeekTargets
} from '../../utils/plans/macro-policy'

const initializePlanSchema = z.object({
  goalId: z.string(),
  startDate: z.string().datetime(), // ISO string
  endDate: z.string().datetime().optional(), // ISO string
  volumePreference: z.enum(['LOW', 'MID', 'HIGH']).default('MID'),
  volumeHours: z.number().finite().min(0).max(168).optional(),
  strategy: z
    .enum(['LINEAR', 'UNDULATING', 'BLOCK', 'POLARIZED', 'REVERSE', 'MAINTENANCE'])
    .default('LINEAR'),
  // When omitted, defaults to the athlete's own sport (was always ['Ride']).
  preferredActivityTypes: z.array(z.string()).optional(),
  customInstructions: z.string().optional(),
  recoveryRhythm: z.number().int().min(2).max(5).default(4), // 4 = 3:1 ratio, 3 = 2:1 ratio
  startingPhase: z.enum(['BASE', 'BUILD', 'PEAK']).default('BASE'),
  historyCompleteness: z.enum(['COMPLETE', 'UNKNOWN']).default('UNKNOWN')
})

export default defineEventHandler(async (event) => {
  const authUser = await requireAuth(event, ['plan:write'])

  const body = await readBody(event)
  const validation = initializePlanSchema.safeParse(body)

  if (!validation.success) {
    throw createError({ statusCode: 400, message: validation.error.message })
  }

  const {
    goalId,
    startDate,
    endDate,
    volumePreference,
    volumeHours,
    strategy,
    customInstructions,
    recoveryRhythm,
    startingPhase
  } = validation.data
  const userId = authUser.id
  // 1. Fetch Goal to get target date
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { events: true } // If linked to an event
  })

  if (!goal || goal.userId !== userId) {
    throw createError({ statusCode: 404, message: 'Goal not found' })
  }

  const primaryEvent = [...goal.events].sort((a, b) => {
    const rank = { A: 0, B: 1, C: 2 }
    return (
      (rank[a.priority as keyof typeof rank] ?? 1) - (rank[b.priority as keyof typeof rank] ?? 1) ||
      a.date.getTime() - b.date.getTime()
    )
  })[0]
  const explicitSport = classifySportFamily(
    primaryEvent?.type || goal.eventType || primaryEvent?.subType
  )
  const goalSport =
    explicitSport === 'ride'
      ? 'cycling'
      : explicitSport === 'run'
        ? 'running'
        : explicitSport === 'swim'
          ? 'swimming'
          : inferSportFromText(goal.eventType || primaryEvent?.subType || goal.title)
  const preferredActivityTypes = validation.data.preferredActivityTypes?.length
    ? validation.data.preferredActivityTypes
    : getDefaultActivityTypes(goalSport || (await getAthletePrimarySport(userId)))

  let targetDate = endDate ? new Date(endDate) : goal.targetDate || goal.eventDate
  if (!targetDate && goal.events.length > 0 && goal.events[0] && !endDate) {
    targetDate = new Date(Math.max(...goal.events.map((e) => e.date.getTime())))
  }

  if (!targetDate) {
    throw createError({ statusCode: 400, message: 'Goal must have a target date' })
  }

  // 2. Calculate Timeline
  // Force start date to UTC midnight of the calendar day
  const timezone = await getUserTimezone(userId)
  const start = getUserLocalDate(timezone, new Date(startDate))

  const end = new Date(new Date(targetDate).toISOString().slice(0, 10) + 'T00:00:00Z')
  // Include the event day, even when it falls on the first day of a partial final week.
  const totalWeeks = Math.ceil(((end.getTime() - start.getTime()) / 86400000 + 1) / 7)
  if (totalWeeks < 4 || totalWeeks > 104) {
    throw createError({ statusCode: 400, message: 'Plan duration must be 4 to 104 weeks' })
  }

  // Keep sport exposure and import uncertainty distinct from the athlete's availability.
  const now = new Date()
  const [workouts, availability] = await Promise.all([
    prisma.workout.findMany({
      where: {
        userId,
        isDuplicate: false,
        date: { gte: new Date(now.getTime() - 28 * 86400000), lte: now }
      },
      select: { id: true, type: true, date: true, durationSec: true, isDuplicate: true, tss: true }
    }),
    prisma.trainingAvailability.findMany({ where: { userId } })
  ])
  const progressionContext = buildPlanProgression({
    now,
    workouts,
    activityTypes: preferredActivityTypes,
    requestedVolumeMinutes: baseWeeklyVolumeMinutes(volumeHours, volumePreference),
    availabilityMinutes: weeklyAvailabilityMinutes(availability),
    historyCompleteness: validation.data.historyCompleteness,
    planWeeks: totalWeeks
  })
  const macroPlan = buildMacroPlan({
    start,
    end,
    activityTypes: preferredActivityTypes,
    progression: progressionContext,
    requestedPhase: startingPhase,
    recoveryRhythm,
    strategy,
    events: goal.events.length
      ? goal.events
      : goal.eventType && (goal.eventDate || goal.targetDate)
        ? [
            {
              id: goal.id,
              title: goal.title,
              date: goal.eventDate || goal.targetDate!,
              subType: goal.eventType,
              priority: 'A',
              distance: goal.distance,
              expectedDuration: goal.duration,
              elevation: goal.elevation,
              terrain: goal.terrain
            }
          ]
        : []
  })
  progressionContext.macroPlan = macroPlan
  const finalBlocksConfig = macroBlocks(macroPlan)
  let loadingWeekOrdinal = 0

  // 0. Clean up any existing DRAFT plans for this user
  // This prevents multiple overlapping draft plans from cluttering the calendar
  // We first fetch them to manually delete AI-managed workouts because of SetNull cascade
  const existingDrafts = await prisma.trainingPlan.findMany({
    where: { userId, status: 'DRAFT' },
    select: { id: true }
  })

  if (existingDrafts.length > 0) {
    const draftIds = existingDrafts.map((d) => d.id)

    // Delete AI-managed workouts for these drafts
    await prisma.plannedWorkout.deleteMany({
      where: {
        userId,
        trainingWeek: {
          block: {
            trainingPlanId: { in: draftIds }
          }
        },
        managedBy: 'COACH_WATTS'
      }
    })

    // Delete the plans themselves (cascades to blocks/weeks)
    await prisma.trainingPlan.deleteMany({
      where: { id: { in: draftIds } }
    })
  }

  // 5. Create Plan Skeleton
  const plan = await trainingPlanRepository.create(
    {
      userId,
      goalId,
      startDate: start,
      targetDate: end,
      strategy,
      status: 'DRAFT',
      activityTypes: preferredActivityTypes,
      customInstructions: customInstructions,
      recoveryRhythm,
      progressionContext,
      description: [macroPlan.rationale, ...progressionContext.explanations].join('\n\n'),
      blocks: {
        create: finalBlocksConfig.map((blockConfig, index) => {
          // Calculate Start Date for this block
          const blockStartDate = new Date(start)
          const weeksPrior = blockConfig.globalWeekStart - 1
          blockStartDate.setUTCDate(blockStartDate.getUTCDate() + weeksPrior * 7)

          return {
            order: index + 1,
            name: blockConfig.name,
            type: blockConfig.type,
            primaryFocus: blockConfig.focus,
            startDate: blockStartDate,
            durationWeeks: blockConfig.durationWeeks,
            recoveryWeekIndex: recoveryRhythm,
            description: macroPlan.rationale,
            weeks: {
              create: Array.from({ length: blockConfig.durationWeeks }).map((_, i) => {
                const weekStart = new Date(blockStartDate)
                weekStart.setUTCDate(weekStart.getUTCDate() + i * 7)
                const weekEnd = new Date(weekStart)
                weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)

                const policy = macroWeekPolicy(macroPlan, weeksPrior + i + 1)
                const isRecovery = policy.isRecovery
                if (policy.advancesLoading) loadingWeekOrdinal++
                const {
                  trainingVolumeMinutes,
                  eventLoadMinutes,
                  eventExceedsCapacity,
                  ...targets
                } = macroWeekTargets(progressionContext, policy, Math.max(1, loadingWeekOrdinal))
                weekEnd.setTime(new Date(policy.end).getTime())

                return {
                  weekNumber: i + 1,
                  startDate: weekStart,
                  endDate: weekEnd,
                  isRecovery,
                  focus: policy.focus,
                  explanation: `${policy.rationale} Ordinary training allowance: ${trainingVolumeMinutes} minutes. ${eventExceedsCapacity ? 'Event exceeds current sport capacity: adjust the goal/event dose before prescription.' : ''}`,
                  ...targets
                }
              })
            }
          }
        })
      }
    },
    {
      blocks: {
        include: {
          weeks: true
        }
      }
    }
  )

  return {
    success: true,
    planId: plan.id,
    plan
  }
})
