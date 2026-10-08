import { prisma } from './db'
import { generateStructuredAnalysis } from './gemini'
import { getEffectiveAffectedSports } from '../../shared/injuries'
import {
  compileWorkoutFamily,
  familySelectionJsonSchema,
  familySelectionSchema,
  resolveFamilySport,
  WORKOUT_FAMILIES,
  WORKOUT_FAMILY_VERSION,
  type FamilyEligibility,
  type FamilySelection,
  type FamilySport,
  type WorkoutFamilyId
} from '../../shared/workout-families'
import { WORKOUT_STRUCTURE_AI_TIMEOUT_MS } from './workout-ai-timeouts'

/** Never let personality or language influence numerical selection. */
export function buildWorkoutFamilySelectionPrompt(input: {
  workout: { type: string; title?: string; description?: string; durationSec?: number }
  eligibility: FamilyEligibility
  previous?: unknown
  adjustments?: unknown
}) {
  return `Select one workout family and dose step from ${WORKOUT_FAMILY_VERSION}.
Return only family, doseStep, and optional intensityFactor. Do not design intervals.
The compiler owns warm-up, cooldown, recovery, time fitting and intensity bounds.
Volume, dose step and intensity are independent: reducing repetitions NEVER means faster targets.
No automatic progression: obey the earned maxDoseStep (missing means 0).
Short fast efforts use RPE only, never intensityFactor. Race-specific work requires the supplied event effort.
Catalogue: ${JSON.stringify(WORKOUT_FAMILIES)}
Athlete eligibility: ${JSON.stringify(input.eligibility)}
Session purpose: ${JSON.stringify({
    type: input.workout.type,
    title: input.workout.title,
    description: input.workout.description,
    durationSec: input.workout.durationSec
  })}
Previous family: ${JSON.stringify(input.previous ?? null)}
Requested changes: ${JSON.stringify(input.adjustments ?? null)}`
}

type CompletedFamilySession = {
  id: string
  type: string | null
  date: Date
  durationSec: number | null
  rpe: number | null
  plannedWorkout?: { durationSec: number | null; structuredWorkout: any } | null
}
/** Count actual exposure only; prose/titles and estimated TSS are not completion evidence. */
export function deriveFamilyEligibility(
  history: CompletedFamilySession[],
  sport: FamilySport,
  now: Date,
  hasSportRestriction: boolean
): FamilyEligibility {
  const recent = history.filter(
    (w) =>
      resolveFamilySport(w.type) === sport &&
      w.date <= now &&
      w.date.getTime() >= now.getTime() - 28 * 86400000 &&
      Number.isFinite(w.durationSec) &&
      (w.durationSec || 0) >= 600
  )
  const maxDoseStep: FamilyEligibility['maxDoseStep'] = {}
  const comparable = new Map<
    WorkoutFamilyId,
    Array<{ selection: FamilySelection; successful: boolean; day: string }>
  >()
  for (const w of [...recent].sort((a, b) => b.date.getTime() - a.date.getTime())) {
    const family = w.plannedWorkout?.structuredWorkout?.workoutFamily
    if (family?.version !== WORKOUT_FAMILY_VERSION || hasSportRestriction) continue
    const accepted = familySelectionSchema.safeParse(family.accepted)
    if (!accepted.success) continue
    const entries = comparable.get(accepted.data.family) || []
    const day = w.date.toISOString().slice(0, 10)
    if (entries.some((entry) => entry.day === day) || entries.length >= 2) continue
    const expected = WORKOUT_FAMILIES[accepted.data.family].rpe
    const planned = w.plannedWorkout?.durationSec || 0
    const successful =
      planned > 0 &&
      (w.durationSec || 0) >= planned * 0.9 &&
      w.rpe != null &&
      w.rpe >= 1 &&
      w.rpe <= expected + 1
    entries.push({ selection: accepted.data, successful, day })
    comparable.set(accepted.data.family, entries)
  }
  for (const [family, entries] of comparable) {
    const latest = entries[0]!
    // Missing/poor feedback holds the last rung. Two recent, separate comparable
    // completions permit proposing the next rung; older successes cannot mask
    // recent difficulty. No capacity diagnosis or automatic calendar mutation.
    maxDoseStep[family] = latest.selection.doseStep
    if (
      entries.length === 2 &&
      entries.every(
        (entry) => entry.successful && entry.selection.doseStep === latest.selection.doseStep
      )
    )
      maxDoseStep[family] = Math.min(2, latest.selection.doseStep + 1)
  }
  return {
    recentSessionCount: new Set(recent.map((w) => w.date.toISOString().slice(0, 10))).size,
    longestSessionSeconds: Math.max(0, ...recent.map((w) => w.durationSec || 0)),
    hasSportRestriction,
    maxDoseStep
  }
}

export async function generateWorkoutFamily(input: {
  workout: any
  sportSettings: any
  primaryMetric: string
  operation: 'generate' | 'adjust'
  adjustments?: { durationMinutes?: number; [key: string]: unknown }
  selection?: FamilySelection
  now?: Date
}) {
  const sport = resolveFamilySport(input.workout.type)
  if (!sport) throw new Error('Unsupported sport for workout families.')
  const now = input.now || new Date()
  const [history, injuries] = await Promise.all([
    prisma.workout.findMany({
      where: {
        userId: input.workout.userId,
        isDuplicate: false,
        date: { gte: new Date(now.getTime() - 28 * 86400000), lte: now }
      },
      select: {
        id: true,
        type: true,
        date: true,
        durationSec: true,
        rpe: true,
        plannedWorkout: { select: { durationSec: true, structuredWorkout: true } }
      }
    }),
    prisma.injury.findMany({
      where: { userId: input.workout.userId, status: { in: ['ACTIVE', 'RECOVERING'] } }
    })
  ])
  const restriction = injuries.some((i) => getEffectiveAffectedSports(i).sports.includes(sport))
  const eligibility = deriveFamilyEligibility(history, sport, now, restriction)
  if (restriction) throw new Error('Workout family cannot override an active sport restriction.')
  // Event targets must come from explicit saved athlete/coach metadata, not a
  // percentage invented by the selector or an inferred race title.
  const eventTarget = input.workout.rawJson?.eventEffortTarget
  if (
    eventTarget?.label &&
    typeof eventTarget.factor === 'number' &&
    Number.isFinite(eventTarget.factor)
  )
    eligibility.eventTarget = { label: String(eventTarget.label), factor: eventTarget.factor }
  const durationSec =
    input.adjustments?.durationMinutes !== undefined
      ? input.adjustments.durationMinutes * 60
      : input.workout.durationSec
  const prompt = buildWorkoutFamilySelectionPrompt({
    workout: { ...input.workout, durationSec },
    eligibility,
    previous: input.workout.structuredWorkout?.workoutFamily?.accepted,
    adjustments: input.adjustments
  })
  const selection =
    input.selection ||
    (await generateStructuredAnalysis(prompt, familySelectionJsonSchema, 'flash', {
      userId: input.workout.userId,
      operation: `${input.operation}_workout_family`,
      entityType: input.workout.externalId ? 'PlannedWorkout' : 'WorkoutTemplate',
      entityId: input.workout.id,
      maxRetries: 1,
      timeoutMs: WORKOUT_STRUCTURE_AI_TIMEOUT_MS
    }))
  const metric =
    input.primaryMetric === 'power' || input.primaryMetric === 'pace' ? input.primaryMetric : 'rpe'
  const compilation = compileWorkoutFamily({
    selection,
    sport,
    durationSeconds: Number(durationSec),
    eligibility,
    warmupSeconds: (input.sportSettings?.warmupTime ?? 10) * 60,
    cooldownSeconds: (input.sportSettings?.cooldownTime ?? 5) * 60,
    references: {
      ftp: sport === 'ride' ? input.sportSettings?.ftp || input.workout.user?.ftp || null : null,
      thresholdPaceMps: sport === 'run' ? input.sportSettings?.thresholdPace || null : null,
      source:
        input.sportSettings?.ftp || input.sportSettings?.thresholdPace
          ? 'sport_settings'
          : sport === 'ride' && input.workout.user?.ftp
            ? 'user_profile'
            : 'unknown',
      metric
    }
  })
  return {
    ...compilation,
    context: {
      ...compilation.provenance,
      capturedAt: now.toISOString(),
      eligibility,
      completedSessionIds: history
        .filter((w) => resolveFamilySport(w.type) === sport)
        .map((w) => w.id),
      selectionModel: input.selection ? 'explicit' : 'flash',
      selectionPromptVersion: 1
    }
  }
}

export function workoutFamilyFallbackReason(workout: any): string | null {
  if (!resolveFamilySport(workout.type)) return 'unsupported_sport'
  if (
    workout.structuredWorkout &&
    workout.structuredWorkout.workoutFamily?.version !== WORKOUT_FAMILY_VERSION
  )
    return 'preserve_existing_library_or_custom_structure'
  return null
}
