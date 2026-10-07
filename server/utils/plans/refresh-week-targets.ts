import type { Prisma } from '@prisma/client'
import {
  calculateProgressionWeekTargets,
  readPlanProgression,
  weeklyAvailabilityMinutes
} from './progression-policy'
import { isRecoveryWeek } from './week-targets'

/** Recalculate the entire skeleton after edits so loading ordinals never restart at a block boundary. */
export async function refreshPlanWeekTargets(
  tx: Prisma.TransactionClient,
  planId: string,
  userId: string
) {
  const plan = await tx.trainingPlan.findFirst({
    where: { id: planId, userId },
    include: {
      blocks: { orderBy: { order: 'asc' }, include: { weeks: { orderBy: { weekNumber: 'asc' } } } }
    }
  })
  const progression = readPlanProgression(plan?.progressionContext)
  if (!plan || !progression) return // Legacy plans retain their existing inferred-volume behavior.
  const availability = weeklyAvailabilityMinutes(
    await tx.trainingAvailability.findMany({ where: { userId } })
  )
  const context = {
    ...progression,
    availabilityMinutes: Math.min(
      progression.availabilityMinutes ?? Infinity,
      availability ?? Infinity
    )
  }
  let ordinal = 0
  for (const block of plan.blocks) {
    for (const week of block.weeks) {
      const isRecovery = isRecoveryWeek(
        week.weekNumber,
        block.recoveryWeekIndex || plan.recoveryRhythm,
        block.type
      )
      if (!isRecovery) ordinal++
      const targets = calculateProgressionWeekTargets(context, {
        blockType: block.type,
        weekNumber: week.weekNumber,
        blockDurationWeeks: block.durationWeeks,
        isRecovery,
        loadingWeekOrdinal: Math.max(1, ordinal)
      })
      await tx.trainingWeek.update({ where: { id: week.id }, data: { ...targets, isRecovery } })
    }
  }
}
