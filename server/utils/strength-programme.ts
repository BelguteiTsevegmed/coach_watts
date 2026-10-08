import { classifySportFamily } from './coaching/sport'
import type { StrengthIntensityReference } from './strength-intensity'

const DAY_MS = 86_400_000

export type StrengthProgrammeSession = {
  id: string
  date: Date | string
  type?: string | null
  durationSec: number
  rpe?: number | null
  sessionRpe?: number | null
}

export type StrengthProgrammeInput = {
  today: Date
  sessions: StrengthProgrammeSession[]
  planPhase?: string | null
  eventDates?: Array<Date | string>
  hasOpenInjury?: boolean
}

export type StrengthProgramme = {
  version: 1
  phase: 'foundation' | 'progressive' | 'maintenance' | 'taper' | 'return' | 'modified'
  reason: string
  maxSetsPerExercise: number
  maxWorkingSets: number
  targetRir: number
  maxSessionRpe: number
  allowLoadIncrease: false
  contributingSessionIds: string[]
}

/** Exposure is evidence of a routine, not evidence of lifting proficiency or good form. */
export function buildStrengthProgramme(input: StrengthProgrammeInput): StrengthProgramme {
  const now = input.today.getTime()
  const unique = new Map<string, StrengthProgrammeSession>()
  for (const session of input.sessions) {
    const date = new Date(session.date).getTime()
    if (classifySportFamily(session.type) !== 'strength' || session.durationSec <= 0 || !session.id)
      continue
    if (!Number.isFinite(date) || date >= now || date < now - 42 * DAY_MS) continue
    unique.set(session.id, session)
  }
  const sessions = [...unique.values()].sort((a, b) => +new Date(b.date) - +new Date(a.date))
  const latest = sessions[0]
  const latestRpe = latest?.sessionRpe ?? latest?.rpe
  const established =
    sessions.length >= 6 &&
    latest &&
    +new Date(latest.date) - +new Date(sessions[sessions.length - 1]!.date) >= 21 * DAY_MS
  const interrupted = latest && now - +new Date(latest.date) > 14 * DAY_MS
  const raceSoon = (input.eventDates || []).some((date) => {
    const days = (+new Date(date) - now) / DAY_MS
    return days >= 0 && days <= 14
  })
  const recovery = /taper|recovery|deload|transition/i.test(input.planPhase || '')

  let phase: StrengthProgramme['phase'] = 'foundation'
  let reason =
    'Experience and recent strength exposure are insufficiently established; prepare movement technique first.'
  if (input.hasOpenInjury) {
    phase = 'modified'
    reason =
      'An open injury requires symptom- and restriction-specific exercise selection; no automatic progression.'
  } else if (raceSoon || /taper/i.test(input.planPhase || '')) {
    phase = 'taper'
    reason =
      'Race/taper proximity: retain familiar movements with reduced sets; introduce no new lifts.'
  } else if (interrupted) {
    phase = 'return'
    reason =
      'More than 14 days since completed strength exposure; rebuild technique and tolerance before restoring volume.'
  } else if (recovery || (latestRpe != null && latestRpe >= 9)) {
    phase = 'maintenance'
    reason =
      'Recovery phase or high recent effort: hold or reduce dose rather than increasing weekly load.'
  } else if (established) {
    phase = 'progressive'
    reason =
      'At least six completed sessions spanning three weeks support a consistent routine; confirm form and experience before heavier work.'
  }
  const progressive = phase === 'progressive'
  return {
    version: 1,
    phase,
    reason,
    maxSetsPerExercise: phase === 'taper' ? 1 : progressive ? 3 : 2,
    maxWorkingSets: phase === 'taper' ? 5 : progressive ? 12 : 8,
    targetRir: progressive ? 3 : 4,
    maxSessionRpe: progressive ? 8 : 6,
    allowLoadIncrease: false,
    contributingSessionIds: sessions.map((session) => session.id)
  }
}

/** One bounded history query shared by weekly planning and native strength generation. */
export async function loadStrengthProgramme(
  client: any,
  userId: string,
  options: Omit<StrengthProgrammeInput, 'sessions'>
): Promise<StrengthProgramme> {
  let sessions: StrengthProgrammeSession[] = []
  try {
    const result = await client.workout.findMany({
      where: {
        userId,
        isDuplicate: false,
        date: { gte: new Date(+options.today - 42 * DAY_MS), lt: options.today },
        OR: ['gym', 'weight', 'strength', 'crossfit', 'lift'].map((type) => ({
          type: { contains: type, mode: 'insensitive' }
        }))
      },
      select: { id: true, date: true, type: true, durationSec: true, rpe: true, sessionRpe: true },
      orderBy: [{ date: 'desc' }, { id: 'asc' }],
      take: 60
    })
    sessions = Array.isArray(result) ? result : []
  } catch (error) {
    console.warn('[strength-programme] History unavailable; using foundational dose', {
      userId,
      error
    })
  }
  return buildStrengthProgramme({ ...options, sessions })
}

export function formatStrengthProgramme(programme: StrengthProgramme): string {
  return `ENDURANCE STRENGTH PROGRAMME v${programme.version} (server-owned dose ceilings):
- Phase: ${programme.phase}. ${programme.reason}
- Completed exposure sessions: ${programme.contributingSessionIds.join(', ') || 'none available'}.
- About two short sessions/week only if availability and the existing athlete/coach routine permit. Preserve established routines and user equipment constraints; do not add sessions on top of an existing gym routine.
- Do not infer lifting skill from endurance fitness or logged exposure. If experience or equipment is unknown, start familiar bodyweight movements and controlled technique; ask before prescribing equipment-dependent or heavy lifts. With known limited equipment, select feasible alternatives, not invented gym access.
- Initial movement menu: squat/sit-to-stand, hinge/bridge, step-up/lunge, calf raise, push/pull and trunk control. Choose only familiar, symptom-compatible movements using the exercise library. Keep the same core movements across weeks so progression is comparable.
- Maximum ${programme.maxSetsPerExercise} work sets per exercise and ${programme.maxWorkingSets} total work sets. Preparation/return: 8-12 controlled reps where suitable; progressive resistance: 6-10 reps on familiar lifts only after confirmed experience/form. Duration-based trunk work is allowed. Taper: cut sets, retain familiar submaximal work, no new exercises.
- Effort: leave at least ${programme.targetRir} reps in reserve (RIR); maximum session RPE ${programme.maxSessionRpe}/10. Write RIR/RPE in exercise notes, explicit sets/reps in native setRows, and explicit rest (usually 60-120 seconds; 2-3 minutes for heavier familiar lifts). No near-maximal tests, failure sets, or automatic plyometrics/power work.
- Progression: repeat the dose until all prescribed sets/reps are completed with stable form, tolerable next-day response and target effort on at least two comparable sessions. Then propose a small rep OR load increase, never both. Missing completion/form/effort evidence means hold. Stop or regress if form deteriorates, effort is excessive, sessions are incomplete or symptoms worsen. No automatic weekly load increases; athlete confirmation of form is required before a proposed increase.
- Use same-exercise recent load references only. Unknown 1RM/load stays unknown: leave numeric load blank and prescribe usable RIR. Do not copy a library default load as the athlete's capacity.
- Placement: protect key runs/rides and long sessions. Prefer 24-48 hours of separation from unfamiliar or demanding lower-body work. When availability requires same-day consolidation, do the priority endurance session first and explain the fatigue tradeoff in reasoningText; keep the following day easy. Never silently move locked workouts to fit gym work. Near races use maintenance/taper volume rather than novel soreness-producing work.
- Injuries: clinician restrictions, affected body areas and symptoms override this menu; low pain is not clearance. Select nonprovoking alternatives or omit strength when necessary. Do not use heavy lifting as generic rehabilitation.
- Track gym duration, work sets/reps and session effort separately from running/cycling minutes and endurance TSS. Gym work must not fill an endurance TSS deficit.
- Explain potential endurance-economy/force benefits without promising injury prevention. Put phase, dose, progression/hold/regression rule and placement rationale in the athlete-facing description/coachInstructions, in the athlete's preferred language.`
}

/** Validate new AI prescriptions after exercise-library defaults, before any persistence. */
export function validateStrengthProgramme(
  structure: any,
  programme: StrengthProgramme,
  references: StrengthIntensityReference[] = []
): { valid: boolean; reason: string | null } {
  if (
    !Number.isFinite(structure?.sRPE_target) ||
    structure.sRPE_target < 1 ||
    structure.sRPE_target > programme.maxSessionRpe
  ) {
    return {
      valid: false,
      reason: `strength session must specify sRPE_target 1-${programme.maxSessionRpe}`
    }
  }
  const knownExercises = new Map(
    references.map((ref) => [ref.exerciseName.trim().toLowerCase(), ref])
  )
  let workSets = 0
  for (const block of Array.isArray(structure?.blocks) ? structure.blocks : []) {
    if (block?.type === 'warmup' || block?.type === 'cooldown') continue
    for (const step of Array.isArray(block?.steps) ? block.steps : []) {
      if (
        step.intent === 'power' ||
        /\b(jump|hops?|plyometric|bounding)\b/i.test(String(step.name || ''))
      )
        return {
          valid: false,
          reason: 'power/plyometric work requires a separate reviewed eligibility decision'
        }
      if (step.intent === 'max_strength' && programme.phase !== 'progressive') {
        return {
          valid: false,
          reason: `${programme.phase} phase cannot prescribe maximal-strength intent`
        }
      }
      const rows = Array.isArray(step?.setRows) ? step.setRows : []
      if (rows.length > programme.maxSetsPerExercise)
        return {
          valid: false,
          reason: `${step.name} exceeds ${programme.maxSetsPerExercise} work sets`
        }
      workSets += rows.length
      if (
        !String(step?.defaultRest || '').trim() &&
        rows.some((row: any) => !String(row?.restOverride || '').trim())
      ) {
        return { valid: false, reason: `${step.name} must specify rest` }
      }
      // RIR/RPE are contract tokens even when explanatory prose is localized.
      if (!/\b(RIR|RPE)\b/i.test(String(step.notes || '')))
        return { valid: false, reason: `${step.name} must specify RIR/RPE effort in notes` }
      const effort = String(step.notes || '')
      const rir = effort.match(/\bRIR\s*[:=]?\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i)
      const rpe = effort.match(/\bRPE\s*[:=]?\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i)
      if (
        (!rir && !rpe) ||
        (rir &&
          (Math.min(Number(rir[1]), Number(rir[2] ?? rir[1])) < programme.targetRir ||
            Math.max(Number(rir[1]), Number(rir[2] ?? rir[1])) > 10)) ||
        (rpe &&
          (Math.min(Number(rpe[1]), Number(rpe[2] ?? rpe[1])) < 1 ||
            Math.max(Number(rpe[1]), Number(rpe[2] ?? rpe[1])) > 10 - programme.targetRir))
      ) {
        return {
          valid: false,
          reason: `${step.name} must target at least RIR ${programme.targetRir} or at most RPE ${10 - programme.targetRir}`
        }
      }
      const reference = knownExercises.get(
        String(step.name || '')
          .trim()
          .toLowerCase()
      )
      if (!reference && rows.some((row: any) => /\d/.test(String(row.loadValue || '')))) {
        return {
          valid: false,
          reason: `${step.name} has no same-exercise load reference; use blank load and RIR`
        }
      }
      for (const row of rows) {
        if (['reps', 'reps_per_side'].includes(String(step.prescriptionMode || 'reps'))) {
          const reps =
            String(row.value || '')
              .match(/\d+(?:\.\d+)?/g)
              ?.map(Number) || []
          if (!reps.length || reps.some((value: number) => value < 6 || value > 15))
            return {
              valid: false,
              reason: `${step.name} must use controlled submaximal rep sets (6-15 reps)`
            }
          if (reference && String(row.loadValue || '').trim()) {
            const targetKg =
              (reference.e1rmKg.minKg / (1 + (Math.max(...reps) + programme.targetRir) / 30)) *
              (1 + Math.min(0, reference.progressionAdjustment))
            const pounds = step.loadMode === 'weight_lb'
            const increment = pounds ? 5 : 2.5
            const ceiling = Math.max(
              increment,
              Math.round((pounds ? targetKg / 0.45359237 : targetKg) / increment) * increment
            )
            const load = Number(row.loadValue)
            if (
              !['weight_lb', 'weight_kg'].includes(step.loadMode) ||
              !Number.isFinite(load) ||
              load <= 0 ||
              load > ceiling
            )
              return {
                valid: false,
                reason: `${step.name} load exceeds the recent reference at RIR ${programme.targetRir}; use blank load or <= ${ceiling} ${pounds ? 'lb' : 'kg'}`
              }
          }
        }
      }
    }
  }
  if (workSets > programme.maxWorkingSets)
    return {
      valid: false,
      reason: `strength dose exceeds ${programme.maxWorkingSets} total work sets`
    }
  return { valid: true, reason: null }
}

/** Gym dose is not an endurance-TSS substitute. Keep its sets/effort in native structure. */
export function normalizeStrengthPlanTss<T extends { days?: any[]; totalTSS?: number }>(
  plan: T
): T {
  if (
    !Array.isArray(plan?.days) ||
    !plan.days.some((day) => classifySportFamily(day.workoutType) === 'strength')
  )
    return plan
  const days = plan.days.map((day) =>
    classifySportFamily(day.workoutType) === 'strength' ? { ...day, targetTSS: 0 } : day
  )
  return {
    ...plan,
    days,
    totalTSS: days.reduce((sum, day) => sum + (Number(day.targetTSS) || 0), 0)
  }
}
