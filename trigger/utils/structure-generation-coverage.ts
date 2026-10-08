import { hasValidRepeatBlockRecovery } from '../../server/utils/structured-workout-validation'
import { looksLikeIntervalWorkout } from './structure-generation-prompt'

function getCoverageThreshold(plannedDurationSec: number) {
  if (plannedDurationSec <= 30 * 60) return 0.8
  if (plannedDurationSec <= 60 * 60) return 0.85
  return 0.9
}

function countWorkBlocks(steps: any[]): number {
  let count = 0
  const visit = (nodes: any[]) => {
    for (const step of nodes || []) {
      if (Array.isArray(step?.steps) && step.steps.length > 0) {
        visit(step.steps)
        continue
      }
      if (step?.type === 'Active') count += 1
    }
  }
  visit(steps)
  return count
}

function hasRepeatBlock(steps: any[]): boolean {
  return (steps || []).some(
    (step: any) =>
      (Number(step?.reps) || Number(step?.repeat) || Number(step?.intervals) || 0) > 1 ||
      (Array.isArray(step?.steps) && hasRepeatBlock(step.steps))
  )
}

function getCoverageBounds(workout: any, plannedDurationSec: number, preserveStructure?: boolean) {
  if (preserveStructure) {
    return { minCoverage: 0.95, maxCoverage: 1.05 }
  }

  const workoutType = String(workout?.type || '').toLowerCase()
  if (workoutType.includes('gym') || workoutType.includes('weight')) {
    const absoluteToleranceRatio = plannedDurationSec > 0 ? 600 / plannedDurationSec : 0
    return {
      minCoverage: 0.7,
      maxCoverage: Math.min(1.35, 1 + Math.max(0.15, absoluteToleranceRatio))
    }
  }

  if (workoutType.includes('swim')) {
    return { minCoverage: 0.7, maxCoverage: 1.2 }
  }

  return {
    minCoverage: getCoverageThreshold(plannedDurationSec),
    maxCoverage: 1.1
  }
}

export function validateStructuredCoverage(params: {
  plannedDurationSec: number
  actualDurationSec: number
  steps: any[]
  workout: any
  preserveStructure?: boolean
}) {
  const { plannedDurationSec, actualDurationSec, steps, workout, preserveStructure } = params

  const repeatRecoveryCheck = hasValidRepeatBlockRecovery(steps)
  if (!repeatRecoveryCheck.valid) {
    return repeatRecoveryCheck
  }

  if (plannedDurationSec <= 0) {
    return { valid: actualDurationSec > 0, reason: actualDurationSec > 0 ? null : 'zero_duration' }
  }

  const coverage = actualDurationSec / plannedDurationSec
  const { minCoverage, maxCoverage } = getCoverageBounds(
    workout,
    plannedDurationSec,
    preserveStructure
  )
  // Planned time is already allocated to the week. An overshoot can pass the
  // sport tolerance here but fail the final weekly-dose guard without a retry.
  const durationCeiling = workout.trainingWeekId ? Math.min(maxCoverage, 1) : maxCoverage
  if (coverage < minCoverage) {
    return {
      valid: false,
      reason: `duration coverage too low (${Math.round(coverage * 100)}% < ${Math.round(minCoverage * 100)}%)`
    }
  }
  if (coverage > durationCeiling) {
    return {
      valid: false,
      reason: `duration overshoot too high (${Math.round(coverage * 100)}% > ${Math.round(durationCeiling * 100)}%)`
    }
  }

  if (looksLikeIntervalWorkout(workout)) {
    const workBlocks = countWorkBlocks(steps)
    const repeated = hasRepeatBlock(steps)
    if (!repeated && workBlocks < 3) {
      return {
        valid: false,
        reason: 'interval workout is missing enough repeated/main-set work blocks'
      }
    }
  }

  return { valid: true, reason: null }
}
