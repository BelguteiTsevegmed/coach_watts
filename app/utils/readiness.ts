/**
 * Plain-language readiness labels for the Today screen.
 *
 * Pure helpers only (no Vue, no i18n): components map the returned levels to
 * translated words and colours. Keep the thresholds here so the words an
 * athlete sees stay consistent wherever readiness is summarised.
 */

export type FormLevel = 'fresh' | 'neutral' | 'tired' | 'very_tired'

/**
 * Form (training stress balance = fitness − fatigue) boundaries. They follow
 * the server-side form zones in `server/utils/training-stress.ts`
 * (`getFormStatus`): above +5 is race-ready, −10…+5 is the neutral
 * maintenance band, −25…−10 is the normal "productive" training band and
 * anything deeper is where injury and illness risk climbs.
 */
export const FORM_LEVEL_THRESHOLDS = {
  fresh: 5,
  neutral: -10,
  tired: -25
} as const

/**
 * Classify a form value. The value is rounded first so the word always agrees
 * with the whole number shown next to it.
 */
export function getFormLevel(tsb: number | null | undefined): FormLevel | null {
  if (tsb === null || tsb === undefined || !Number.isFinite(tsb)) return null
  const value = Math.round(tsb)
  if (value > FORM_LEVEL_THRESHOLDS.fresh) return 'fresh'
  if (value > FORM_LEVEL_THRESHOLDS.neutral) return 'neutral'
  if (value > FORM_LEVEL_THRESHOLDS.tired) return 'tired'
  return 'very_tired'
}

export type ReadinessTone = 'success' | 'neutral' | 'warning' | 'error'

export function getFormTone(level: FormLevel | null): ReadinessTone {
  switch (level) {
    case 'fresh':
      return 'success'
    case 'tired':
      return 'warning'
    case 'very_tired':
      return 'error'
    default:
      return 'neutral'
  }
}

export type HrvDirection = 'above' | 'below' | 'normal'

export interface HrvTrend {
  direction: HrvDirection
  /** Whole-number percentage difference from the baseline, always >= 0. */
  deltaPct: number
}

/**
 * Compare today's HRV with the athlete's own recent baseline (e.g. a 7-day
 * average). Day-to-day HRV is noisy, so anything within `tolerancePct` of the
 * baseline counts as "normal".
 */
export function getHrvTrend(
  current: number | null | undefined,
  baseline: number | null | undefined,
  tolerancePct = 5
): HrvTrend | null {
  if (current === null || current === undefined || !Number.isFinite(current)) return null
  if (baseline === null || baseline === undefined || !Number.isFinite(baseline) || baseline <= 0) {
    return null
  }

  const delta = ((current - baseline) / baseline) * 100
  const deltaPct = Math.round(Math.abs(delta))
  if (deltaPct <= tolerancePct) return { direction: 'normal', deltaPct }
  return { direction: delta > 0 ? 'above' : 'below', deltaPct }
}

export type SleepLevel = 'good' | 'fair' | 'short'

/** Most endurance athletes need 7–9 hours; under 6 is clearly short. */
export function getSleepLevel(hours: number | null | undefined): SleepLevel | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours <= 0) return null
  if (hours >= 7) return 'good'
  if (hours >= 6) return 'fair'
  return 'short'
}

export function getSleepTone(level: SleepLevel | null): ReadinessTone {
  if (level === 'good') return 'success'
  if (level === 'short') return 'warning'
  return 'neutral'
}

/** "7h 12m" from decimal hours. */
export function formatSleepHours(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours <= 0) return null
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
