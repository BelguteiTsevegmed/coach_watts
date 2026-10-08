import type { Prisma } from '@prisma/client'
import {
  calculateProgressionWeekTargets,
  readPlanProgression,
  weeklyAvailabilityMinutes
} from './progression-policy'
import { isRecoveryWeek } from './week-targets'
import { readMacroPlan, macroWeekPolicy, macroWeekTargets } from './macro-policy'

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
  const savedMacro = readMacroPlan(progression)
  const lastWeekEnd = Math.max(
    ...plan.blocks.flatMap((b) => b.weeks.map((w) => w.endDate.getTime()))
  )
  const macro = savedMacro
    ? {
        ...savedMacro,
        start: plan.startDate?.toISOString() || savedMacro.start,
        end: new Date(Math.max(new Date(savedMacro.end).getTime(), lastWeekEnd)).toISOString()
      }
    : null
  let globalWeekNumber = 0
  for (const block of plan.blocks) {
    for (const week of block.weeks) {
      globalWeekNumber++
      if (macro) {
        const policy = macroWeekPolicy(macro, globalWeekNumber)
        if (policy.advancesLoading) ordinal++
        const { eventExceedsCapacity, trainingVolumeMinutes, eventLoadMinutes, ...targets } =
          macroWeekTargets(context, policy, Math.max(1, ordinal))
        await tx.trainingWeek.update({
          where: { id: week.id },
          data: {
            ...targets,
            isRecovery: policy.isRecovery,
            focus: policy.focus,
            explanation: `${policy.rationale} Ordinary training allowance: ${trainingVolumeMinutes} minutes. ${eventExceedsCapacity ? 'Event exceeds current sport capacity: adjust the goal/event dose before prescription.' : ''}`
          }
        })
        continue
      }
      const isRecovery = isRecoveryWeek(
        globalWeekNumber,
        block.recoveryWeekIndex || plan.recoveryRhythm,
        block.type
      )
      if (!isRecovery && !['PEAK', 'RACE', 'TRANSITION'].includes(block.type)) ordinal++
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
