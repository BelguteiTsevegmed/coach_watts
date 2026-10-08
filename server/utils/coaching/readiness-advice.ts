import { getEffectiveAffectedSports, INJURY_MODIFY_PAIN_THRESHOLD } from '../../../shared/injuries'
import { classifySportFamily } from './sport'
import { READINESS_POLICY, type ResolvedReadiness } from '../../../shared/readiness'

/** Suggestions are reviewable advice only; this function never writes a session. */
export function applyReadinessAdvice<
  T extends {
    recommendation: string
    reasoning: string
    suggested_modifications?: Record<string, any>
    injury_guard?: unknown
  }
>(
  analysis: T,
  context: ResolvedReadiness,
  session: {
    title?: string | null
    type?: string | null
    durationSec?: number | null
    tss?: number | null
  } | null
): T {
  const advice = { ...analysis }
  if (
    context.decision === 'rest' ||
    (context.decision === 'reduce' && advice.recommendation !== 'rest' && session?.type !== 'Rest')
  ) {
    const injuryConflict = context.injuries.some(
      (injury) =>
        injury.status === 'ACTIVE' &&
        injury.painLevel >= INJURY_MODIFY_PAIN_THRESHOLD &&
        getEffectiveAffectedSports(injury).sports.includes(
          classifySportFamily(session?.type) as any
        )
    )
    const proposeRest =
      injuryConflict ||
      context.decision === 'rest' ||
      !!analysis.injury_guard ||
      !session?.durationSec ||
      session.durationSec < 60
    advice.recommendation = proposeRest ? 'rest' : 'reduce_intensity'
    advice.reasoning = [
      ...context.reasons,
      ...context.conflicts,
      'This is a proposed change; your calendar has not been changed.'
    ]
      .filter(Boolean)
      .join(' ')
    advice.suggested_modifications = proposeRest
      ? {
          new_title: 'Rest Day',
          new_type: 'Rest',
          new_duration_min: 0,
          new_tss: 0,
          description: 'Rest and reassess symptoms before returning to training.',
          reason: context.reasons.join(' ')
        }
      : {
          new_type: session?.type || analysis.suggested_modifications?.new_type,
          ...(session?.durationSec != null
            ? {
                new_duration_min: Math.min(
                  READINESS_POLICY.reducedSessionMinutes,
                  Math.floor(session.durationSec / 60)
                )
              }
            : {}),
          new_title: `Easy ${session?.type || 'session'} (readiness adjustment)`,
          description:
            'Replace key intensity with easy conversational work at RPE 2-3/10, at most 30 minutes and no longer than planned. Stop if symptoms worsen; reassess before the next key session.',
          intensity: 'easy',
          structured_workout: {
            steps: [
              {
                type: 'Active',
                name: 'Easy conversational work',
                intent: 'easy',
                duration: Math.min(
                  READINESS_POLICY.reducedSessionMinutes * 60,
                  Math.floor((session?.durationSec || 0) / 60) * 60
                ),
                primaryTarget: 'rpe',
                rpe: 3
              }
            ]
          },
          reason:
            'Replace the key effort with easy work or rest; do not increase duration or load. Reassess before applying.'
        }
  }
  return Object.assign(advice, {
    readiness_context: context,
    readiness_application: {
      status: 'advice_only',
      original: session,
      proposed: advice.suggested_modifications ?? null,
      reasons: context.reasons,
      requiresValidation: true
    }
  })
}
