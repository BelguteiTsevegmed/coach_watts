import { READINESS_POLICY, type ResolvedReadiness } from '../../../shared/readiness'
import { classifySportFamily } from '../coaching/sport'
import { getEffectiveAffectedSports, INJURY_MODIFY_PAIN_THRESHOLD } from '../../../shared/injuries'
import { DEFAULT_PROGRESSION_POLICY, type SportVolumeTargets } from '../plans/progression-policy'

/** Product heuristics; passing these rules is not medical clearance. */
export const PRESCRIPTION_POLICY = {
  version: 'training-prescription-v2',
  historyDays: 28,
  runExposureDays: 30,
  minimumHardDayGap: 2,
  runSessionMultiplier: 1.2,
  starterSessionSeconds: 1800,
  distanceCautionMultiplier: 1.1
} as const
export type PrescriptionSession = {
  id?: string
  plannedWorkoutId?: string | null
  date: string
  type: string | null
  title?: string | null
  durationSec: number | null
  distanceMeters?: number | null
  tss?: number | null
  hard?: boolean | null
  protected?: boolean
}
export type PrescriptionWeek = {
  start: string
  end: string
  volumeMinutes: number
  sportMinutes?: SportVolumeTargets | null
  tss?: number | null
}
export type PrescriptionAvailability = {
  dayOfWeek: number
  morning: boolean
  afternoon: boolean
  evening: boolean
  slots: unknown
}
export type PrescriptionInjury = {
  id: string
  bodyArea: string
  status: string
  painLevel: number
  affectedSports: string[]
  loadRestriction?: string | null
  redFlags?: string[]
}
export type PrescriptionSnapshot = {
  capturedAt: string
  today: string
  timezone: string
  planned: PrescriptionSession[]
  completed: PrescriptionSession[]
  weeks: PrescriptionWeek[]
  availability: PrescriptionAvailability[]
  injuries: PrescriptionInjury[]
  readiness?: ResolvedReadiness
}
export type PrescriptionViolation = {
  rule: string
  kind: 'product_policy' | 'evidence_caution' | 'uncertainty'
  severity: 'block' | 'warn'
  sessionId?: string
  date?: string
  observed?: number | null
  limit?: number | null
  message: string
}
const validDay = (day: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
  new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
const dayNumber = (day: string) => new Date(`${day}T00:00:00Z`).getTime() / 86400000
const minutes = (sessions: PrescriptionSession[]) =>
  sessions.reduce((n, s) => n + Math.max(0, s.durationSec || 0) / 60, 0)
const family = (session: PrescriptionSession) => classifySportFamily(session.type)
const isRest = (session: PrescriptionSession) => /^(rest|off)$/i.test(session.type || '')
const validDose = (value: number | null | undefined) =>
  value == null || (Number.isFinite(value) && value >= 0)
const enduranceHard = (session: PrescriptionSession) =>
  session.hard === true && ['run', 'ride', 'swim'].includes(family(session))
export function isProtectedPrescriptionSession(workout: {
  completed?: boolean | null
  completionStatus?: string
  modifiedLocally?: boolean
  managedBy?: string | null
  syncConflict?: boolean
  rawJson?: unknown
}) {
  const metadata =
    workout.rawJson && typeof workout.rawJson === 'object'
      ? (workout.rawJson as Record<string, unknown>)
      : {}
  return !!(
    workout.completed ||
    (workout.completionStatus && workout.completionStatus !== 'PENDING') ||
    workout.modifiedLocally ||
    workout.managedBy === 'USER' ||
    workout.syncConflict ||
    metadata.locked ||
    metadata.isAnchor
  )
}

/** Pure assessment. Proposed adjustments are advice, never accepted writes. */
export function assessTrainingPrescription(
  snapshot: PrescriptionSnapshot,
  proposals: PrescriptionSession[],
  options: { replaceIds?: string[]; imported?: boolean; readOnly?: boolean } = {}
) {
  const violations: PrescriptionViolation[] = []
  const adjustments: Array<{ sessionId?: string; date: string; maxDurationSec: number }> = []
  const hit = (
    rule: string,
    message: string,
    session?: PrescriptionSession,
    details: Partial<PrescriptionViolation> = {}
  ) =>
    violations.push({
      rule,
      message,
      kind: 'product_policy',
      severity: 'block',
      sessionId: session?.id,
      date: session?.date,
      ...details
    })
  const actualIds = new Set(snapshot.completed.map((s) => s.plannedWorkoutId).filter(Boolean))
  const replaced = new Set([
    ...(options.replaceIds || []),
    ...proposals.map((s) => s.id).filter((id): id is string => !!id)
  ])
  const committed = [
    ...snapshot.planned.filter((s) => !replaced.has(s.id || '') && !actualIds.has(s.id)),
    ...snapshot.completed
  ]
  const combined = [...committed, ...proposals]
  const recentRuns = snapshot.completed.filter(
    (s) =>
      family(s) === 'run' &&
      s.date <= snapshot.today &&
      dayNumber(snapshot.today) - dayNumber(s.date) < PRESCRIPTION_POLICY.runExposureDays
  )
  const observed = {
    runHistoryCount: recentRuns.length,
    completedCount: snapshot.completed.length,
    committedCount: committed.length,
    historyCompleteness: 'UNVERIFIED_IMPORTS'
  }
  for (const proposal of proposals) {
    const sport = family(proposal)
    if (
      !validDay(proposal.date) ||
      !validDose(proposal.durationSec) ||
      !validDose(proposal.distanceMeters) ||
      !validDose(proposal.tss) ||
      (!isRest(proposal) && (proposal.durationSec == null || proposal.durationSec <= 0)) ||
      (isRest(proposal) &&
        ((proposal.durationSec || 0) > 0 ||
          (proposal.distanceMeters || 0) > 0 ||
          (proposal.tss || 0) > 0))
    ) {
      hit(
        'invalid_dose',
        'Provide a valid calendar date and a finite, positive training duration; rest must have zero dose.',
        proposal
      )
      continue
    }
    if (
      !options.readOnly &&
      proposal.id &&
      (actualIds.has(proposal.id) ||
        snapshot.planned.some((s) => s.id === proposal.id && s.protected))
    ) {
      hit(
        'protected_session',
        'Completed or locked sessions cannot be replaced through prescription edits.',
        proposal
      )
      continue
    }
    if (isRest(proposal)) continue
    const readiness = snapshot.readiness
    // Current feedback expires: do not project today's symptoms through the whole plan.
    if (
      readiness &&
      readiness.asOf === snapshot.today &&
      proposal.date >= snapshot.today &&
      proposal.date <= readiness.application.horizonThrough
    ) {
      if (
        readiness.decision === 'rest' ||
        (readiness.decision === 'reduce' &&
          (proposal.hard !== false ||
            (proposal.durationSec || 0) > READINESS_POLICY.reducedSessionMinutes * 60))
      )
        hit(
          'personal_readiness',
          readiness.reasons.join(' ') +
            ' Propose rest or confirmed easy work and reassess before applying.',
          proposal
        )
    }
    for (const injury of snapshot.injuries) {
      if (
        !['ACTIVE', 'RECOVERING'].includes(injury.status) ||
        !getEffectiveAffectedSports(injury).sports.includes(sport as any)
      )
        continue
      if (
        injury.redFlags?.length ||
        injury.loadRestriction ||
        (injury.status === 'ACTIVE' && injury.painLevel >= INJURY_MODIFY_PAIN_THRESHOLD)
      )
        hit(
          'injury_restriction',
          `This ${sport} session loads the logged ${injury.bodyArea} injury. Choose rest or an unaffected activity until the recorded restriction is resolved; red flags need clinical assessment.`,
          proposal
        )
      else
        hit(
          'injury_context',
          `The logged ${injury.bodyArea} injury requires condition-specific guidance; low pain does not establish clearance.`,
          proposal,
          { severity: 'warn', kind: 'uncertainty' }
        )
    }
    if (enduranceHard(proposal)) {
      const neighbour = combined.find(
        (s) =>
          s !== proposal &&
          enduranceHard(s) &&
          Math.abs(dayNumber(s.date) - dayNumber(proposal.date)) <
            PRESCRIPTION_POLICY.minimumHardDayGap
      )
      if (neighbour)
        hit(
          'hard_session_spacing',
          `Leave at least one easy/rest calendar day between hard endurance sessions. This session conflicts with ${neighbour.title || neighbour.type} on ${neighbour.date}.`,
          proposal,
          { observed: Math.abs(dayNumber(neighbour.date) - dayNumber(proposal.date)), limit: 2 }
        )
    } else if (proposal.hard == null)
      hit(
        'intensity_unknown',
        'Session intensity is unresolved; hard-session spacing cannot be fully assessed until structure is available.',
        proposal,
        { kind: 'uncertainty', severity: 'warn' }
      )
    if (sport === 'run') {
      const priorRuns = snapshot.completed.filter(
        (s) =>
          family(s) === 'run' &&
          s.date < proposal.date &&
          dayNumber(proposal.date) - dayNumber(s.date) <= 30
      )
      // Expected future exposure may support a product duration ramp, never the evidence distance baseline.
      const priorPlanned = combined.filter(
        (s) =>
          s !== proposal &&
          family(s) === 'run' &&
          s.date >= snapshot.today &&
          s.date < proposal.date &&
          dayNumber(proposal.date) - dayNumber(s.date) <= 30
      )
      const longestSeconds = Math.max(
        0,
        ...[...priorRuns, ...priorPlanned].map((s) => s.durationSec || 0)
      )
      const lastActual = snapshot.completed
        .filter((s) => family(s) === 'run' && s.date <= snapshot.today)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
      const returning =
        lastActual &&
        dayNumber(snapshot.today) - dayNumber(lastActual.date) >=
          DEFAULT_PROGRESSION_POLICY.breakDays
      const maxDurationSec = Math.floor(
        Math.max(
          PRESCRIPTION_POLICY.starterSessionSeconds,
          longestSeconds * PRESCRIPTION_POLICY.runSessionMultiplier
        ) * (returning ? DEFAULT_PROGRESSION_POLICY.returningMultiplier : 1)
      )
      if ((proposal.durationSec || 0) > maxDurationSec) {
        hit(
          'run_session_progression',
          `Running duration exceeds the ${Math.round(maxDurationSec / 60)}-minute product allowance from recent exposure. Revise the session and its structure before applying.`,
          proposal,
          { observed: proposal.durationSec, limit: maxDurationSec }
        )
        adjustments.push({ sessionId: proposal.id, date: proposal.date, maxDurationSec })
      }
      const distances = priorRuns.filter(
        (s) => typeof s.distanceMeters === 'number' && s.distanceMeters > 0
      )
      const longestDistance = Math.max(0, ...distances.map((s) => s.distanceMeters!))
      if (
        longestDistance > 0 &&
        proposal.distanceMeters &&
        proposal.distanceMeters > longestDistance * PRESCRIPTION_POLICY.distanceCautionMultiplier
      )
        hit(
          'run_distance_exposure',
          'Proposed distance exceeds the longest completed run in the previous 30 days by more than 10%. Observational evidence supports a caution, not an injury probability or a universal safe boundary.',
          proposal,
          {
            kind: 'evidence_caution',
            severity: 'warn',
            observed: proposal.distanceMeters,
            limit: Number(
              (longestDistance * PRESCRIPTION_POLICY.distanceCautionMultiplier).toFixed(2)
            )
          }
        )
      if (!priorRuns.length || !distances.length || proposal.distanceMeters == null)
        hit(
          'history_missing',
          'Recent running exposure or distance is incomplete. Missing imports are not confirmed inactivity; confirm history before increasing dose.',
          proposal,
          { kind: 'uncertainty', severity: 'warn' }
        )
    }
  }
  const activeProposals = proposals.filter((s) => validDay(s.date) && !isRest(s))
  for (const date of new Set(activeProposals.map((s) => s.date))) {
    const daySessions = combined.filter((s) => s.date === date && !isRest(s))
    const availability = snapshot.availability.find(
      (a) => a.dayOfWeek === new Date(`${date}T00:00:00Z`).getUTCDay()
    )
    if (!snapshot.availability.length) continue
    const slots = Array.isArray(availability?.slots)
      ? (availability.slots as Array<{ duration?: number; activityTypes?: string[] }>)
      : []
    if (
      !availability ||
      (!slots.length && !availability.morning && !availability.afternoon && !availability.evening)
    ) {
      hit(
        'availability',
        `No training availability is recorded on ${date}.`,
        activeProposals.find((s) => s.date === date)
      )
      continue
    }
    if (slots.length) {
      const totalBudget = slots.reduce((sum, s) => sum + Math.max(0, Number(s.duration) || 0), 0)
      if (minutes(daySessions) > totalBudget + 0.01)
        hit(
          'availability',
          `Combined training on ${date} exceeds the ${totalBudget}-minute daily availability.`,
          activeProposals.find((s) => s.date === date),
          { observed: minutes(daySessions), limit: totalBudget }
        )
      for (const sport of new Set(activeProposals.filter((s) => s.date === date).map(family))) {
        const matching = slots.filter(
          (s) =>
            !s.activityTypes?.length ||
            s.activityTypes.some((type) => classifySportFamily(type) === sport)
        )
        const budget = matching.reduce((sum, s) => sum + Math.max(0, Number(s.duration) || 0), 0)
        const dose = minutes(daySessions.filter((s) => family(s) === sport))
        if (dose > budget + 0.01)
          hit(
            'availability',
            `Combined ${sport} sessions on ${date} exceed matching availability.`,
            activeProposals.find((s) => s.date === date && family(s) === sport),
            { observed: dose, limit: budget }
          )
      }
    }
  }
  // Evaluate each calendar week once. Saved sport targets are the captured progression budget.
  const ranges = new Map<string, PrescriptionWeek>()
  for (const s of activeProposals) {
    const saved = snapshot.weeks.find((w) => s.date >= w.start && s.date <= w.end)
    const startDate = new Date(`${s.date}T00:00:00Z`)
    startDate.setUTCDate(startDate.getUTCDate() - ((startDate.getUTCDay() + 6) % 7))
    const start = saved?.start || startDate.toISOString().slice(0, 10)
    const endDate = new Date(startDate)
    endDate.setUTCDate(endDate.getUTCDate() + 6)
    ranges.set(
      start,
      saved || { start, end: endDate.toISOString().slice(0, 10), volumeMinutes: Infinity }
    )
  }
  for (const week of ranges.values()) {
    const sessions = combined.filter((s) => s.date >= week.start && s.date <= week.end)
    if (minutes(sessions) > week.volumeMinutes + 0.01)
      hit(
        'weekly_volume',
        'The proposed combined schedule exceeds the weekly duration budget.',
        undefined,
        { date: week.start, observed: minutes(sessions), limit: week.volumeMinutes }
      )
    for (const sport of new Set(
      activeProposals.filter((s) => s.date >= week.start && s.date <= week.end).map(family)
    )) {
      const recent = snapshot.completed.filter(
        (s) =>
          family(s) === sport &&
          s.date <= snapshot.today &&
          dayNumber(snapshot.today) - dayNumber(s.date) < 28
      )
      const last = snapshot.completed
        .filter((s) => family(s) === sport && s.date <= snapshot.today)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
      const returning =
        last &&
        dayNumber(snapshot.today) - dayNumber(last.date) >= DEFAULT_PROGRESSION_POLICY.breakDays
      const fallback =
        Math.max(
          DEFAULT_PROGRESSION_POLICY.starterMinutes[sport],
          (minutes(recent) / 4) * DEFAULT_PROGRESSION_POLICY.initialMultiplier
        ) * (returning ? DEFAULT_PROGRESSION_POLICY.returningMultiplier : 1)
      const budget = week.sportMinutes ? week.sportMinutes[sport] || 0 : fallback
      const dose = minutes(sessions.filter((s) => family(s) === sport))
      if (dose > budget + 0.01)
        hit(
          'sport_weekly_volume',
          `The combined ${sport} schedule exceeds its weekly product progression allowance.`,
          undefined,
          { date: week.start, observed: dose, limit: budget }
        )
    }
    if (week.tss != null && sessions.every((s) => s.tss != null && validDose(s.tss))) {
      const dose = sessions.reduce((sum, s) => sum + s.tss!, 0)
      if (dose > week.tss + 0.01)
        hit('weekly_tss', 'The combined schedule exceeds the weekly TSS budget.', undefined, {
          date: week.start,
          observed: dose,
          limit: week.tss
        })
    }
  }
  const blocks = violations.filter((v) => v.severity === 'block')
  const accepted = options.imported || !blocks.length
  const onlyAdjustable =
    blocks.length > 0 &&
    blocks.every((v) =>
      [
        'run_session_progression',
        'weekly_volume',
        'sport_weekly_volume',
        'weekly_tss',
        'availability'
      ].includes(v.rule)
    )
  const outcome = options.imported
    ? violations.length
      ? 'warn'
      : 'allow'
    : blocks.length
      ? onlyAdjustable
        ? 'adjust'
        : 'reject'
      : violations.length
        ? 'warn'
        : 'allow'
  return {
    version: PRESCRIPTION_POLICY.version,
    policy: PRESCRIPTION_POLICY,
    capturedAt: snapshot.capturedAt,
    accepted: !!accepted,
    outcome,
    observed,
    violations,
    adjustments,
    proposals,
    readiness: snapshot.readiness ?? null,
    imported: !!options.imported
  }
}
