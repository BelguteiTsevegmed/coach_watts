/**
 * Pure helpers behind the Progress page (/performance).
 *
 * Everything here turns data the page already fetches (PMC points, the workouts
 * list, weekly zone totals, goals) into plain-language building blocks. No
 * fetching, no Vue, no i18n — the components translate the returned kinds.
 */

export type SportGroup = 'run' | 'swim' | 'ride' | 'strength' | 'other'

/**
 * Stacking / legend order for sport groups. Fixed so a sport keeps its colour
 * and position no matter which other sports the athlete does.
 */
export const SPORT_GROUP_ORDER: readonly SportGroup[] = ['run', 'swim', 'ride', 'strength', 'other']

const SPORT_GROUP_BY_TYPE: Record<string, SportGroup> = {
  run: 'run',
  virtualrun: 'run',
  trailrun: 'run',
  treadmill: 'run',
  swim: 'swim',
  openwaterswim: 'swim',
  ride: 'ride',
  virtualride: 'ride',
  mountainbikeride: 'ride',
  gravelride: 'ride',
  ebikeride: 'ride',
  emountainbikeride: 'ride',
  velomobile: 'ride',
  handcycle: 'ride',
  weighttraining: 'strength',
  gym: 'strength',
  crossfit: 'strength',
  workout: 'strength'
}

export function sportGroupOf(type?: string | null): SportGroup {
  if (!type) return 'other'
  const key = type.replace(/[\s_-]/g, '').toLowerCase()
  return SPORT_GROUP_BY_TYPE[key] ?? 'other'
}

// ---------------------------------------------------------------------------
// Dates — everything is bucketed by the athlete's local calendar day
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD` for `date` in `timeZone` (falls back to UTC on a bad zone). */
export function localDateKey(date: Date | string, timeZone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

function keyToUtc(key: string): number {
  return Date.parse(`${key}T00:00:00Z`)
}

export function addDaysToKey(key: string, days: number): string {
  return new Date(keyToUtc(key) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Whole calendar days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / DAY_MS)
}

/** Monday of the ISO week containing `key`. */
export function mondayOfKey(key: string): string {
  const day = new Date(keyToUtc(key)).getUTCDay() // 0 = Sunday
  return addDaysToKey(key, day === 0 ? -6 : 1 - day)
}

// ---------------------------------------------------------------------------
// Workouts → weekly volume and consistency
// ---------------------------------------------------------------------------

export interface ProgressWorkout {
  date: string | Date
  type?: string | null
  durationSec?: number | null
  distanceMeters?: number | null
  averageWatts?: number | null
}

export interface VolumeTotals {
  sessions: number
  durationSec: number
  distanceMeters: number
}

export interface WeeklyVolumeBucket extends VolumeTotals {
  /** Monday of the week, `YYYY-MM-DD`. */
  weekStart: string
  /** True for the week that contains `today` (still in progress). */
  isCurrent: boolean
  bySport: Record<SportGroup, VolumeTotals>
}

function emptyTotals(): VolumeTotals {
  return { sessions: 0, durationSec: 0, distanceMeters: 0 }
}

function emptyBySport(): Record<SportGroup, VolumeTotals> {
  return {
    run: emptyTotals(),
    swim: emptyTotals(),
    ride: emptyTotals(),
    strength: emptyTotals(),
    other: emptyTotals()
  }
}

function finite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Monday-to-Sunday weekly totals for the last `weeks` weeks, oldest first.
 * The final bucket is the current (partial) week.
 */
export function buildWeeklyVolume(
  workouts: ProgressWorkout[],
  options: { weeks?: number; today?: Date; timeZone?: string } = {}
): WeeklyVolumeBucket[] {
  const weeks = Math.max(1, options.weeks ?? 12)
  const todayKey = localDateKey(options.today ?? new Date(), options.timeZone)
  const currentMonday = mondayOfKey(todayKey)
  const firstMonday = addDaysToKey(currentMonday, -7 * (weeks - 1))

  const buckets: WeeklyVolumeBucket[] = Array.from({ length: weeks }, (_, index) => ({
    weekStart: addDaysToKey(firstMonday, index * 7),
    isCurrent: index === weeks - 1,
    ...emptyTotals(),
    bySport: emptyBySport()
  }))
  const indexByWeek = new Map(buckets.map((bucket, index) => [bucket.weekStart, index]))

  for (const workout of workouts) {
    const key = localDateKey(workout.date, options.timeZone)
    if (!key || key > todayKey) continue
    const index = indexByWeek.get(mondayOfKey(key))
    if (index === undefined) continue
    const bucket = buckets[index]!
    const sport = bucket.bySport[sportGroupOf(workout.type)]
    const duration = finite(workout.durationSec)
    const distance = finite(workout.distanceMeters)

    bucket.sessions += 1
    bucket.durationSec += duration
    bucket.distanceMeters += distance
    sport.sessions += 1
    sport.durationSec += duration
    sport.distanceMeters += distance
  }

  return buckets
}

/**
 * Drop empty weeks before the first session (typically before the athlete
 * started syncing), keeping at least `minWeeks` so the axis stays readable.
 */
export function trimLeadingEmptyWeeks(
  buckets: WeeklyVolumeBucket[],
  minWeeks = 6
): WeeklyVolumeBucket[] {
  const firstActive = buckets.findIndex((bucket) => bucket.sessions > 0)
  if (firstActive <= 0) return buckets
  return buckets.slice(Math.min(firstActive, Math.max(0, buckets.length - minWeeks)))
}

/** Sport groups that appear in any bucket, in `SPORT_GROUP_ORDER`. */
export function sportsInVolume(buckets: WeeklyVolumeBucket[]): SportGroup[] {
  return SPORT_GROUP_ORDER.filter((sport) =>
    buckets.some((bucket) => bucket.bySport[sport].sessions > 0)
  )
}

export interface VolumeAverages extends VolumeTotals {
  /** Number of complete weeks the average is taken over. */
  weeks: number
}

/**
 * Per-week averages over the complete (non-current) weeks. Leading empty weeks
 * are skipped — they usually mean "no data synced yet", not weeks off — while
 * empty weeks after the first session still count.
 */
export function averageCompleteWeeks(buckets: WeeklyVolumeBucket[]): VolumeAverages {
  const firstActive = buckets.findIndex((bucket) => bucket.sessions > 0)
  const complete = (firstActive === -1 ? [] : buckets.slice(firstActive)).filter(
    (bucket) => !bucket.isCurrent
  )
  const weeks = complete.length
  if (weeks === 0) return { weeks: 0, ...emptyTotals() }
  const total = complete.reduce(
    (acc, bucket) => ({
      sessions: acc.sessions + bucket.sessions,
      durationSec: acc.durationSec + bucket.durationSec,
      distanceMeters: acc.distanceMeters + bucket.distanceMeters
    }),
    emptyTotals()
  )
  return {
    weeks,
    sessions: total.sessions / weeks,
    durationSec: total.durationSec / weeks,
    distanceMeters: total.distanceMeters / weeks
  }
}

export interface SessionRate {
  sessions: number
  weeks: number
  /** Sessions per week, rounded to one decimal. */
  perWeek: number
}

/** Sessions per week over a rolling window ending today (default 6 weeks). */
export function sessionsPerWeek(
  workouts: ProgressWorkout[],
  options: { days?: number; today?: Date; timeZone?: string } = {}
): SessionRate {
  const days = Math.max(7, options.days ?? 42)
  const todayKey = localDateKey(options.today ?? new Date(), options.timeZone)
  const fromKey = addDaysToKey(todayKey, -(days - 1))
  const sessions = workouts.filter((workout) => {
    const key = localDateKey(workout.date, options.timeZone)
    return key >= fromKey && key <= todayKey
  }).length
  const weeks = days / 7
  return { sessions, weeks, perWeek: Math.round((sessions / weeks) * 10) / 10 }
}

export function hasPowerData(
  workouts: ProgressWorkout[],
  personalBests: Array<{ type?: string | null; unit?: string | null }> = []
): boolean {
  return (
    workouts.some((workout) => finite(workout.averageWatts) > 0) ||
    personalBests.some((pb) => pb.unit === 'W' || !!pb.type?.startsWith('POWER_'))
  )
}

// ---------------------------------------------------------------------------
// Fitness (CTL) trend and form (TSB)
// ---------------------------------------------------------------------------

export type FitnessTrendKind = 'up' | 'down' | 'steady' | 'building' | 'none'

export interface FitnessTrend {
  kind: FitnessTrendKind
  start: number
  end: number
  change: number
  /** Percent change from `start`; null when there is no meaningful baseline. */
  changePct: number | null
  /** Length of the comparison window in whole weeks. */
  weeks: number
}

/**
 * Compare fitness (CTL) at the start of the PMC window with now.
 *
 * - `building`: the window starts from (almost) nothing, so a percentage would
 *   be meaningless ("up 900%"); describe it as building instead.
 * - `steady`: within ±`steadyPct` percent.
 */
export function computeFitnessTrend(
  points: Array<{ date: string; ctl: number | null | undefined }>,
  options: { currentCtl?: number | null; minBaseline?: number; steadyPct?: number } = {}
): FitnessTrend {
  const minBaseline = options.minBaseline ?? 5
  const steadyPct = options.steadyPct ?? 3
  const valid = points.filter((point) => typeof point.ctl === 'number' && !!point.date)
  const first = valid[0]
  const last = valid[valid.length - 1]
  const start = first ? Number(first.ctl) : 0
  const end =
    typeof options.currentCtl === 'number' && Number.isFinite(options.currentCtl)
      ? options.currentCtl
      : last
        ? Number(last.ctl)
        : 0
  const days =
    first && last
      ? daysBetweenKeys(String(first.date).slice(0, 10), String(last.date).slice(0, 10))
      : 0
  const weeks = Math.max(1, Math.round(days / 7))
  const change = end - start

  if (!first || (start < 1 && end < 1)) {
    return { kind: 'none', start, end, change, changePct: null, weeks }
  }
  if (start < minBaseline) {
    return {
      kind: end > start + 0.5 ? 'building' : 'none',
      start,
      end,
      change,
      changePct: null,
      weeks
    }
  }

  const changePct = Math.round((change / start) * 100)
  const kind: FitnessTrendKind =
    Math.abs(changePct) < steadyPct ? 'steady' : changePct > 0 ? 'up' : 'down'
  return { kind, start, end, change, changePct, weeks }
}

export type FormBand = 'very_fresh' | 'fresh' | 'neutral' | 'tired' | 'very_tired' | 'overreached'

/**
 * Plain-language form band for a TSB (form) value. The cut-offs match the
 * server's `getFormStatus` so the page never contradicts the PMC card.
 */
export function classifyForm(tsb: number | null | undefined): FormBand | null {
  if (typeof tsb !== 'number' || !Number.isFinite(tsb)) return null
  if (tsb > 25) return 'very_fresh'
  if (tsb > 5) return 'fresh'
  if (tsb > -10) return 'neutral'
  if (tsb > -25) return 'tired'
  if (tsb > -40) return 'very_tired'
  return 'overreached'
}

// ---------------------------------------------------------------------------
// Intensity distribution (easy / moderate / hard)
// ---------------------------------------------------------------------------

export type ZoneSource = 'hr' | 'power'

export interface IntensitySplit {
  source: ZoneSource
  easyPct: number
  moderatePct: number
  hardPct: number
  totalHours: number
}

function sumZones(
  weeks: Array<{ hrZones?: number[]; powerZones?: number[] }>,
  source: ZoneSource
): number[] {
  const totals: number[] = []
  for (const week of weeks) {
    const zones = (source === 'hr' ? week.hrZones : week.powerZones) || []
    zones.forEach((hours, index) => {
      totals[index] = (totals[index] || 0) + finite(hours)
    })
  }
  return totals
}

export function zoneSourcesWithData(
  weeks: Array<{ hrZones?: number[]; powerZones?: number[] }>
): ZoneSource[] {
  return (['power', 'hr'] as const).filter((source) =>
    sumZones(weeks, source).some((hours) => hours > 0)
  )
}

/**
 * Share of zone time that is easy (zones 1–2), moderate (zone 3) and hard
 * (zone 4 and above). Uses `preferred` when it has data, otherwise whichever
 * source does. Percentages are rounded and always add up to 100.
 */
export function computeIntensitySplit(
  weeks: Array<{ hrZones?: number[]; powerZones?: number[] }>,
  preferred: ZoneSource = 'hr'
): IntensitySplit | null {
  const available = zoneSourcesWithData(weeks)
  if (available.length === 0) return null
  const source = available.includes(preferred) ? preferred : available[0]!
  const totals = sumZones(weeks, source)
  const total = totals.reduce((acc, hours) => acc + hours, 0)
  if (total <= 0) return null

  const easy = (totals[0] || 0) + (totals[1] || 0)
  const moderate = totals[2] || 0
  const easyPct = Math.round((easy / total) * 100)
  const moderatePct = Math.min(100 - easyPct, Math.round((moderate / total) * 100))
  return {
    source,
    easyPct,
    moderatePct,
    hardPct: 100 - easyPct - moderatePct,
    totalHours: Math.round(total * 10) / 10
  }
}

export type IntensityVerdict = 'polarised' | 'close' | 'too_hard'

/** How the easy share compares with the ~80/20 guideline. */
export function intensityVerdict(split: IntensitySplit): IntensityVerdict {
  if (split.easyPct >= 75) return 'polarised'
  if (split.easyPct >= 65) return 'close'
  return 'too_hard'
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export interface ProgressGoal {
  id: string
  title?: string | null
  type?: string | null
  status?: string | null
  priority?: string | null
  targetDate?: string | null
  eventDate?: string | null
  startValue?: number | null
  currentValue?: number | null
  targetValue?: number | null
  events?: Array<{ date?: string | null }> | null
}

/**
 * The date a goal counts down to: its event date, else the next upcoming
 * linked event (or the last one if all have passed), else its target date.
 * Returned as a `YYYY-MM-DD` key (goal dates are stored as UTC midnight).
 */
export function goalTargetKey(goal: ProgressGoal, todayKey: string): string | null {
  if (goal.eventDate) return String(goal.eventDate).slice(0, 10)
  const eventKeys = (goal.events || [])
    .map((event) => (event?.date ? String(event.date).slice(0, 10) : ''))
    .filter(Boolean)
    .sort()
  if (eventKeys.length > 0) {
    return eventKeys.find((key) => key >= todayKey) ?? eventKeys[eventKeys.length - 1]!
  }
  if (goal.targetDate) return String(goal.targetDate).slice(0, 10)
  return null
}

export type CountdownKind = 'weeks' | 'days' | 'tomorrow' | 'today' | 'past'

export function describeCountdown(days: number): { kind: CountdownKind; value: number } {
  if (days < 0) return { kind: 'past', value: Math.abs(days) }
  if (days === 0) return { kind: 'today', value: 0 }
  if (days === 1) return { kind: 'tomorrow', value: 1 }
  if (days < 14) return { kind: 'days', value: days }
  return { kind: 'weeks', value: Math.floor(days / 7) }
}

/** Progress (0–100) for goals with a start, current and target value; else null. */
export function goalProgressPct(goal: ProgressGoal): number | null {
  const { startValue, currentValue, targetValue } = goal
  if (
    typeof startValue !== 'number' ||
    typeof currentValue !== 'number' ||
    typeof targetValue !== 'number' ||
    targetValue === startValue
  ) {
    return null
  }
  const pct = ((currentValue - startValue) / (targetValue - startValue)) * 100
  return Math.round(Math.min(100, Math.max(0, pct)))
}

export interface UpcomingGoal {
  goal: ProgressGoal
  targetKey: string | null
  daysLeft: number | null
}

/** Active goals, soonest dated goal first, undated goals last. */
export function upcomingGoals(goals: ProgressGoal[], todayKey: string): UpcomingGoal[] {
  return goals
    .filter((goal) => (goal.status ?? 'ACTIVE') === 'ACTIVE')
    .map((goal) => {
      const targetKey = goalTargetKey(goal, todayKey)
      return {
        goal,
        targetKey,
        daysLeft: targetKey ? daysBetweenKeys(todayKey, targetKey) : null
      }
    })
    .sort((a, b) => {
      if (a.daysLeft === null && b.daysLeft === null) return 0
      if (a.daysLeft === null) return 1
      if (b.daysLeft === null) return -1
      // Upcoming before passed; nearest first within each.
      const aPast = a.daysLeft < 0
      const bPast = b.daysLeft < 0
      if (aPast !== bPast) return aPast ? 1 : -1
      return aPast ? b.daysLeft - a.daysLeft : a.daysLeft - b.daysLeft
    })
}

// ---------------------------------------------------------------------------
// Section visibility (user-customisable, stored in dashboardSettings)
// ---------------------------------------------------------------------------

export const PROGRESS_SECTION_KEYS = [
  'goals',
  'pmc',
  'volume',
  'distribution',
  'records',
  'powerCurve',
  'efficiency',
  'ftp',
  'athleteProfile',
  'workoutScores',
  'nutritionScores'
] as const

export type ProgressSectionKey = (typeof PROGRESS_SECTION_KEYS)[number]

/** Sections that only make sense for athletes who train with power. */
export const POWER_SECTION_KEYS: readonly ProgressSectionKey[] = ['powerCurve', 'efficiency', 'ftp']

/**
 * Merge stored `performanceSections` settings over the defaults (everything
 * visible). Unknown stored keys from older layouts are ignored.
 */
export function resolveSectionVisibility(
  stored?: Record<string, { visible?: boolean } | undefined> | null
): Record<ProgressSectionKey, { visible: boolean }> {
  return Object.fromEntries(
    PROGRESS_SECTION_KEYS.map((key) => [key, { visible: stored?.[key]?.visible !== false }])
  ) as Record<ProgressSectionKey, { visible: boolean }>
}
