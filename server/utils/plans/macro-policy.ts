import { classifySportFamily, type SportFamily } from '../coaching/sport'
import { calculateProgressionWeekTargets, type PlanProgression } from './progression-policy'
import { TSS_PER_HOUR } from './week-targets'

/** Bounded product heuristics; these are not readiness tests or performance guarantees. */
export const MACRO_POLICY_VERSION = 'event-macro-v1' as const
const DAY = 86400000
type Phase = 'BASE' | 'BUILD' | 'PEAK'
export type MacroEventInput = {
  id: string
  title: string
  date: Date
  type?: string | null
  subType?: string | null
  priority?: string | null
  distance?: number | null // km, as stored by Event/Goal
  expectedDuration?: number | null // hours, as stored by Event/Goal
  terrain?: string | null
  elevation?: number | null
}
type MacroEvent = Omit<MacroEventInput, 'date'> & {
  date: string
  sport: SportFamily
  kind: string
  supported: boolean
  priority: 'A' | 'B' | 'C'
  taperWeeks: number // includes race week
  transitionWeeks: number
  minimumPreparationWeeks: number
  durationMinutes: number | null
  weekNumber: number
}
export type MacroPlan = {
  version: typeof MACRO_POLICY_VERSION
  start: string
  end: string
  totalWeeks: number
  sport: SportFamily
  strategy: string
  requestedPhase: Phase
  resolvedPhase: Phase
  capacityVerified: boolean
  recoveryRhythm: number
  events: MacroEvent[]
  warnings: string[]
  goalAdjustmentRequired: boolean
  rationale: string
}
export type MacroWeek = {
  globalWeekNumber: number
  start: string
  end: string
  days: number
  type: string
  focus: string
  kind: 'LOADING' | 'RECOVERY' | 'TAPER' | 'RACE' | 'MINI_TAPER' | 'TRAINING_EVENT' | 'TRANSITION'
  isRecovery: boolean
  volumeFactor: number
  qualityDoseFactor: number
  frequencyFactor: number
  advancesLoading: boolean
  events: MacroEvent[]
  eventLoadMinutes: number | null
  rationale: string
}
function day(date: Date): Date {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid macro-plan date')
  return new Date(date.toISOString().slice(0, 10) + 'T00:00:00Z')
}
function positive(value?: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function resolveEvent(input: MacroEventInput, start: Date, fallbackSport: SportFamily): MacroEvent {
  // Explicit event type wins. In particular, MTB (Marathon) is a cycling event.
  let sport = classifySportFamily(input.type)
  const subtype = (input.subType || '').toLowerCase()
  const text = `${input.type || ''} ${subtype}`.toLowerCase()
  if (sport === 'other') {
    if (/mtb|gravel|cycl|fondo|criterium|time trial|road race|social ride/.test(text))
      sport = 'ride'
    else if (/running|marathon|\b[510]0?k\b/.test(text)) sport = 'run'
    else sport = fallbackSport
  }
  let kind = 'unsupported'
  let taperWeeks = 1
  let transitionWeeks = 1
  let minimumPreparationWeeks = 8
  const road = !/trail|ultra|mountain/.test(`${text} ${input.terrain || ''}`.toLowerCase())
  if (sport === 'run' && road) {
    const km = positive(input.distance)
    if (/half marathon/.test(text) || (km !== null && Math.abs(km - 21.0975) < 0.3)) {
      kind = 'run-half'
      taperWeeks = 2
      minimumPreparationWeeks = 10
    } else if (/marathon/.test(text) || (km !== null && Math.abs(km - 42.195) < 0.3)) {
      kind = 'run-marathon'
      taperWeeks = 3
      transitionWeeks = 2
      minimumPreparationWeeks = 12
    } else if (/10\s?k/.test(text) || km === 10) kind = 'run-10k'
    else if (/5\s?k/.test(text) || km === 5) kind = 'run-5k'
  } else if (sport === 'ride') {
    const cyclingTypes: Record<string, string> = {
      'road race': 'ride-road',
      criterium: 'ride-criterium',
      'time trial': 'ride-tt',
      'gran fondo': 'ride-fondo',
      'mtb (xc)': 'ride-xc',
      'mtb (marathon)': 'ride-mtb-marathon',
      gravel: 'ride-gravel',
      cyclocross: 'ride-cx',
      'social ride': 'ride-social',
      cyclotour: 'ride-tour',
      'cyclotour (toertocht)': 'ride-tour'
    }
    kind = cyclingTypes[subtype] || cyclingTypes[(input.type || '').toLowerCase()] || 'unsupported'
    if (['ride-fondo', 'ride-mtb-marathon', 'ride-gravel', 'ride-tour', 'ride-road'].includes(kind))
      taperWeeks = 2
  }
  const durationHours = positive(input.expectedDuration)
  return {
    id: input.id,
    title: input.title,
    type: input.type ?? null,
    subType: input.subType ?? null,
    date: day(input.date).toISOString(),
    sport,
    kind,
    supported: kind !== 'unsupported',
    priority: input.priority === 'A' || input.priority === 'C' ? input.priority : 'B',
    distance: positive(input.distance),
    expectedDuration: durationHours,
    terrain: input.terrain ?? null,
    elevation: input.elevation ?? null,
    taperWeeks,
    transitionWeeks,
    minimumPreparationWeeks,
    durationMinutes: durationHours === null ? null : Math.round(durationHours * 60),
    weekNumber: Math.floor((day(input.date).getTime() - start.getTime()) / (7 * DAY)) + 1
  }
}

export function buildMacroPlan(input: {
  start: Date
  end: Date
  activityTypes: string[]
  progression: PlanProgression
  requestedPhase: Phase
  recoveryRhythm: number
  strategy: string
  events: MacroEventInput[]
}): MacroPlan {
  const start = day(input.start)
  const end = day(input.end)
  const days = (end.getTime() - start.getTime()) / DAY + 1
  if (days <= 0 || days > 7 * 104) throw new Error('Plan calendar must span 1 day to 104 weeks')
  const totalWeeks = Math.ceil(days / 7)
  const sport: SportFamily =
    input.activityTypes.map(classifySportFamily).find((s) => s === 'run' || s === 'ride') || 'other'
  const warnings: string[] = []
  const events = input.events
    .map((e) => resolveEvent(e, start, sport))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const eventSports = [...new Set(events.map((e) => e.sport))]
  const relevantSports = eventSports.length ? eventSports : [sport]
  const capturedAt = new Date(input.progression.capturedAt)
  const snapshotFresh = Math.abs(start.getTime() - capturedAt.getTime()) <= 14 * DAY
  const capacityVerified =
    snapshotFresh &&
    input.progression.history.completeness === 'COMPLETE' &&
    relevantSports.every((s) => {
      const exposure = input.progression.sports[s]
      return (
        exposure?.status === 'ACTIVE' &&
        (exposure.daysSinceLastWorkout ?? Infinity) <= 7 &&
        exposure.recentWeeklyAvgMinutes >= (s === 'run' ? 90 : 120) &&
        (exposure.completedSessions ?? 0) >= 8 &&
        (exposure.activeWeeks ?? 0) >= 3
      )
    })
  const peakVerified =
    capacityVerified &&
    relevantSports.every(
      (s) =>
        (input.progression.sports[s]?.recentWeeklyAvgMinutes || 0) * 1.2 >=
        input.progression.requestedVolumeMinutes
    ) &&
    events.some((e) => e.priority === 'A' && e.supported)
  const resolvedPhase: Phase =
    input.requestedPhase === 'PEAK' && peakVerified
      ? 'PEAK'
      : input.requestedPhase !== 'BASE' && capacityVerified
        ? 'BUILD'
        : 'BASE'
  if (resolvedPhase !== input.requestedPhase)
    warnings.push(
      `Requested ${input.requestedPhase} start changed to ${resolvedPhase}: recent sport capacity/history does not support bypassing preparation. Confirm completed exposure before advancing.`
    )
  if (!capacityVerified)
    warnings.push(
      'Recent sport capacity is unverified or interrupted. Use easy preparation and reassessment; event proximity does not justify adding hard work.'
    )
  if (start.getTime() - capturedAt.getTime() > 14 * DAY)
    warnings.push(
      'The plan starts more than 14 days after the history snapshot. Reassess current capacity before generating sessions.'
    )
  for (const event of events) {
    if (event.date < start.toISOString() || event.date > end.toISOString())
      warnings.push(
        `${event.title}: event lies outside this plan calendar; adjust the dates or unlink it.`
      )
    if (!event.supported)
      warnings.push(
        `${event.title}: unsupported sport/event profile; conservative aerobic preparation and one reduced event week are a fallback, not a validated event programme.`
      )
    if (event.priority === 'A' && event.weekNumber < event.minimumPreparationWeeks)
      warnings.push(
        `${event.title}: the ${event.weekNumber}-week timeline is shorter than this policy's ${event.minimumPreparationWeeks}-week preparation window. Consider a later event, lower ambition, or a completion-focused goal; readiness is not guaranteed.`
      )
    if (!input.progression.sports[event.sport])
      warnings.push(
        `${event.title}: its sport has no selected training allowance. Select that sport and reassess capacity before prescribing the event.`
      )
    if (event.durationMinutes === null)
      warnings.push(
        `${event.title}: expected duration is unknown; event load must be confirmed before race-week prescription.`
      )
  }
  for (let i = 0; i < events.length; i++) {
    const current = events[i]!
    const next = events.slice(i + 1).find((e) => e.priority !== 'C')
    if (
      current.priority !== 'C' &&
      next &&
      next.weekNumber - (next.priority === 'A' ? next.taperWeeks - 1 : 0) <=
        current.weekNumber + current.transitionWeeks
    )
      warnings.push(
        `${current.title} and ${next.title}: event recovery and preparation overlap. Adjust event priority, effort, or timeline; both peaks cannot be promised.`
      )
  }
  const goalAdjustmentRequired = warnings.some((w) =>
    /timeline|outside|unsupported|overlap|no selected|unverified|interrupted/.test(w)
  )
  return {
    version: MACRO_POLICY_VERSION,
    start: start.toISOString(),
    end: end.toISOString(),
    totalWeeks,
    sport,
    strategy: input.strategy,
    requestedPhase: input.requestedPhase,
    resolvedPhase,
    capacityVerified,
    recoveryRhythm: Math.max(2, Math.min(5, input.recoveryRhythm)),
    events,
    warnings,
    goalAdjustmentRequired,
    rationale: `Training calendar for ${sport === 'run' ? 'running' : sport === 'ride' ? 'cycling' : 'endurance training'} (${input.strategy}); ${totalWeeks} weeks including the target day. Start in ${resolvedPhase}. Recovery cadence follows global weeks, with event taper and post-event transition taking precedence. Volume is bounded by completed sport exposure and availability. Taper retains familiar intensity and frequency only when capacity permits, with less quality-work dose.\n${warnings.join('\n')}`
  }
}

export function readMacroPlan(value: unknown): MacroPlan | null {
  if (!value || typeof value !== 'object') return null
  const macro = (value as { macroPlan?: MacroPlan }).macroPlan
  return macro?.version === MACRO_POLICY_VERSION ? macro : null
}

export function macroWeekPolicy(plan: MacroPlan, globalWeekNumber: number): MacroWeek {
  const start = new Date(new Date(plan.start).getTime() + (globalWeekNumber - 1) * 7 * DAY)
  const end = new Date(Math.min(start.getTime() + 6 * DAY, new Date(plan.end).getTime()))
  const days = Math.max(0, (end.getTime() - start.getTime()) / DAY + 1)
  const calendarEvents = plan.events.map((e) => ({
    ...e,
    weekNumber:
      Math.floor((new Date(e.date).getTime() - new Date(plan.start).getTime()) / (7 * DAY)) + 1
  }))
  const events = calendarEvents.filter(
    (e) => e.date >= start.toISOString() && e.date <= end.toISOString()
  )
  const upcoming = calendarEvents.find(
    (e) => e.priority === 'A' && e.weekNumber >= globalWeekNumber && e.date <= plan.end
  )
  const prior = [...calendarEvents]
    .reverse()
    .find(
      (e) =>
        e.priority !== 'C' &&
        e.weekNumber < globalWeekNumber &&
        globalWeekNumber <= e.weekNumber + e.transitionWeeks
    )
  let kind: MacroWeek['kind'] = 'LOADING'
  const supported = plan.events.every((e) => e.supported)
  let type =
    !supported ||
    (plan.resolvedPhase === 'BASE' && (!plan.capacityVerified || globalWeekNumber <= 4))
      ? 'BASE'
      : 'BUILD'
  let focus = type === 'BASE' ? 'AEROBIC_ENDURANCE' : 'RACE_SPECIFIC'
  if (plan.strategy === 'MAINTENANCE') {
    type = 'MAINTENANCE'
    focus = 'AEROBIC_ENDURANCE'
  }
  let volumeFactor = 1
  let qualityDoseFactor = plan.capacityVerified && supported ? 1 : 0
  let frequencyFactor = 1
  if (globalWeekNumber % plan.recoveryRhythm === 0) {
    kind = 'RECOVERY'
    volumeFactor = 0.6
    qualityDoseFactor = 0
    focus = 'RECOVERY'
  }
  if (upcoming && upcoming.weekNumber - globalWeekNumber < upcoming.taperWeeks) {
    kind = 'TAPER'
    type = 'PEAK'
    focus = 'TAPER'
    const weeksBefore = upcoming.weekNumber - globalWeekNumber
    volumeFactor = weeksBefore >= 2 ? 0.75 : 0.6
    qualityDoseFactor = plan.capacityVerified && upcoming.supported ? 0.5 : 0
  }
  if (prior) {
    kind = 'TRANSITION'
    type = 'TRANSITION'
    focus = 'RECOVERY'
    volumeFactor = 0.5
    qualityDoseFactor = 0
    frequencyFactor = 0.8
  }
  if (events.length) {
    if (events.some((e) => e.priority === 'A')) {
      kind = 'RACE'
      type = 'RACE'
      focus = 'RACE_SPECIFIC'
      volumeFactor = 0.4
      qualityDoseFactor = plan.capacityVerified && events.every((e) => e.supported) ? 0.25 : 0
    } else if (events.some((e) => e.priority === 'B')) {
      kind = 'MINI_TAPER'
      volumeFactor = Math.min(volumeFactor, 0.8)
      qualityDoseFactor = Math.min(qualityDoseFactor, 0.5)
    } else kind = 'TRAINING_EVENT'
  }
  if (!plan.capacityVerified || !supported) qualityDoseFactor = 0
  const eventLoadMinutes = events.some((e) => e.durationMinutes === null)
    ? null
    : events.reduce((n, e) => n + (e.durationMinutes || 0), 0)
  const isRecovery = kind === 'RECOVERY' || kind === 'TRANSITION'
  return {
    globalWeekNumber,
    start: start.toISOString(),
    end: end.toISOString(),
    days,
    type,
    focus,
    kind,
    isRecovery,
    volumeFactor,
    qualityDoseFactor,
    frequencyFactor,
    advancesLoading: kind === 'LOADING' || kind === 'TRAINING_EVENT',
    events,
    eventLoadMinutes,
    rationale: `Plan week ${globalWeekNumber}: ${kind}. Ordinary training volume ${Math.round(volumeFactor * 100)}% of the loading allowance; quality-work dose ${Math.round(qualityDoseFactor * 100)}%; session frequency ${Math.round(frequencyFactor * 100)}%. These reduce dose, never increase target intensity. Event load ${eventLoadMinutes === null ? 'unknown — confirm before prescription' : `${eventLoadMinutes} minutes`} is reserved separately inside the week's sport ceiling. ${events.map((e) => `${e.title} (${e.priority}) on ${e.date.slice(0, 10)}`).join('; ')}${kind === 'MINI_TAPER' ? ' Reduce work on the two days before the B event; the event replaces a key session.' : ''}${kind === 'TRAINING_EVENT' ? ' C event replaces training, with no additional peak.' : ''}`
  }
}

export function macroBlocks(plan: MacroPlan) {
  const blocks: Array<{
    name: string
    type: string
    focus: string
    durationWeeks: number
    globalWeekStart: number
  }> = []
  for (let i = 1; i <= plan.totalWeeks; i++) {
    const week = macroWeekPolicy(plan, i)
    // Recovery is a week-level dose decision, not a new mesocycle.
    const focus =
      week.kind === 'RECOVERY'
        ? week.type === 'BASE'
          ? 'AEROBIC_ENDURANCE'
          : 'RACE_SPECIFIC'
        : week.focus
    const last = blocks.at(-1)
    if (last && last.type === week.type && last.focus === focus && last.durationWeeks < 12)
      last.durationWeeks++
    else
      blocks.push({
        name: `${week.type} — ${plan.sport}`,
        type: week.type,
        focus,
        durationWeeks: 1,
        globalWeekStart: i
      })
  }
  return blocks
}

/** Freeze loading ordinals through taper/recovery; reserve events without manufacturing endurance load. */
export function macroWeekTargets(
  context: PlanProgression,
  week: MacroWeek,
  loadingWeekOrdinal: number
) {
  const baseline = calculateProgressionWeekTargets(context, {
    blockType: 'BASE',
    weekNumber: 1,
    blockDurationWeeks: 1,
    isRecovery: false,
    loadingWeekOrdinal
  })
  const sportVolumeTargets = { ...baseline.sportVolumeTargets }
  let trainingVolumeMinutes = 0
  let eventExceedsCapacity = false
  for (const [sport, allowance] of Object.entries(baseline.sportVolumeTargets)) {
    const sportEvents = week.events.filter((e) => e.sport === sport)
    const eventMinutes = sportEvents.reduce((n, e) => n + (e.durationMinutes || 0), 0)
    // The event is one exposure, even on day one of a partial final week.
    // Only ordinary training is prorated; a race is compared to the full sport allowance.
    const ceiling = sportEvents.length ? allowance : Math.floor((allowance * week.days) / 7)
    if (eventMinutes > ceiling) eventExceedsCapacity = true
    // Unknown event dose gets no speculative extra sessions in the same sport.
    const training = sportEvents.some((e) => e.durationMinutes === null)
      ? 0
      : Math.max(
          0,
          Math.min(
            ceiling - eventMinutes,
            Math.floor(((allowance * week.days) / 7) * week.volumeFactor)
          )
        )
    trainingVolumeMinutes += training
    sportVolumeTargets[sport as SportFamily] = training + Math.min(eventMinutes, ceiling)
  }
  if (week.events.some((e) => !Object.hasOwn(baseline.sportVolumeTargets, e.sport)))
    eventExceedsCapacity = true
  return {
    volumeTargetMinutes: Object.values(sportVolumeTargets).reduce((n, minutes) => n + minutes, 0),
    sportVolumeTargets,
    tssTarget: Math.round(
      Object.entries(sportVolumeTargets).reduce(
        (n, [sport, minutes]) =>
          n +
          (minutes / 60) *
            (context.sports[sport as SportFamily]?.tssEstimate?.perHour ?? TSS_PER_HOUR),
        0
      )
    ),
    trainingVolumeMinutes,
    eventLoadMinutes: week.eventLoadMinutes,
    eventExceedsCapacity
  }
}

export function formatMacroWeekForPrompt(value: unknown, startDate: Date): string {
  const plan = readMacroPlan(value)
  if (!plan) return ''
  const globalWeekNumber =
    Math.floor((day(startDate).getTime() - new Date(plan.start).getTime()) / (7 * DAY)) + 1
  const week = macroWeekPolicy(plan, globalWeekNumber)
  return `AUTHORITATIVE EVENT/CAPACITY POLICY:\n${plan.rationale}\n${week.rationale}\nDo not restart recovery cadence at block boundaries or add a loading ramp during taper/transition. Preserve familiar intensity only within the quality-dose limit; never infer fitness from the selected phase. Count the event once inside the volume ceiling, not on top of ordinary training. If event duration is unknown or exceeds the allowance, propose an event-dose/goal adjustment and reassessment rather than forcing the full event into the plan.`
}
