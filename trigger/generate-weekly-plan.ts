import { formatMacroWeekForPrompt } from '../server/utils/plans/macro-policy'
import { retireReplacedPrescriptionExports } from '../server/utils/training-prescription/replacement-sync'
import { randomUUID } from 'node:crypto'
import {
  lockPrescriptionSchedule,
  validatePrescriptionWrite,
  withPrescriptionAssessment
} from '../server/utils/training-prescription/service'
import { isProtectedPrescriptionSession } from '../server/utils/training-prescription/assessment'
import { COACHING_EVIDENCE_VERSION } from '../shared/coaching-evidence'
import {
  readSportVolumeTargets,
  remainingProgressionBudgets,
  committedProgressionSessions,
  progressionSessionDay,
  type SportVolumeTargets
} from '../server/utils/plans/progression-policy'
import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { getUserAiSettings } from '../server/utils/ai-user-settings'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { wellnessRepository } from '../server/utils/repositories/wellnessRepository'
import { sportSettingsRepository } from '../server/utils/repositories/sportSettingsRepository'
import { availabilityRepository } from '../server/utils/repositories/availabilityRepository'
import {
  generateTrainingContext,
  formatTrainingContextForPrompt
} from '../server/utils/training-metrics'
import { userBackgroundQueue } from './queues'
import { checkQuota } from '../server/utils/quotas/engine'
import {
  getUserTimezone,
  getUserLocalDate,
  getStartOfDaysAgoUTC,
  formatUserDate,
  getStartOfDayUTC,
  getEndOfDayUTC,
  formatDateUTC,
  calculateAge,
  getStartOfLocalDateUTC,
  getEndOfLocalDateUTC,
  parseCalendarDate
} from '../server/utils/date'
import {
  formatPromptWeight,
  formatPromptHeight,
  formatPromptDistance
} from '../server/utils/ai-prompt-format'
import { bodyMetricResolver } from '../server/utils/services/bodyMetricResolver'
import { buildWorkoutCleanupQuery } from '../server/utils/plans/cleanup'
import { filterGoalsForContext } from '../server/utils/goal-context'
import { autoUploadPlannedWorkoutToIntervalsIfEnabled } from '../server/utils/intervals-sync'
import { normalizeGeneratedWorkoutType } from '../server/utils/plans/workout-type'
import {
  validateGeneratedBlockWeeks,
  clampGeneratedBlockWeeks,
  formatViolationsFeedback,
  type GeneratedBlockWeek,
  type WeekVolumeTarget
} from '../server/utils/plans/block-volume'

import { registerTaskHandler } from '../server/utils/task-registry'
import { getAthletePrimarySport, getSportLabel } from '../server/utils/coaching/sport'
import { buildCoachingPrinciples } from '../server/utils/coaching/principles'
import { buildCoachRoleIntro } from '../server/utils/coaching/persona'
import { fetchOpenInjuries, formatInjuriesForPrompt } from '../server/utils/coaching/injury-context'

const weeklyPlanSchema = {
  type: 'object',
  properties: {
    weekSummary: {
      type: 'string',
      description: 'Brief overview of the weekly plan strategy'
    },
    totalTSS: {
      type: 'number',
      description: 'Total weekly Training Stress Score'
    },
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format (must be within the planned week range)'
          },
          dayOfWeek: { type: 'number', description: 'Day of week (0-6)' },
          workoutType: {
            type: 'string',
            description:
              'Type of workout: Ride, Run, Gym, Swim, or Rest. DO NOT use generic terms like "Workout" or "Active Recovery". For recovery days, use "Rest" or a light "Ride"/"Run".',
            enum: ['Ride', 'Run', 'Gym', 'Swim', 'Rest']
          },
          timeOfDay: {
            type: 'string',
            enum: ['morning', 'afternoon', 'evening'],
            description: 'Recommended time of day'
          },
          title: { type: 'string', description: 'Workout title' },
          description: { type: 'string', description: 'Detailed workout description' },
          durationMinutes: { type: 'number', description: 'Duration in minutes' },
          distanceMeters: {
            type: 'number',
            description: 'Estimated distance in meters (for Run/Swim)'
          },
          targetArea: {
            type: 'string',
            description: 'Focus area for Gym workouts (e.g. Legs, Upper Body, Core)'
          },
          targetTSS: { type: 'number', description: 'Target Training Stress Score' },
          intensity: {
            type: 'string',
            enum: ['recovery', 'easy', 'moderate', 'hard', 'very_hard'],
            description: 'Workout intensity level'
          },
          location: {
            type: 'string',
            enum: ['indoor', 'outdoor', 'gym'],
            description: 'Location for the workout'
          },
          reasoningText: {
            type: 'string',
            description: 'Why this workout on this day'
          }
        },
        required: [
          'date',
          'dayOfWeek',
          'workoutType',
          'title',
          'description',
          'durationMinutes',
          'reasoningText'
        ]
      }
    }
  },
  required: ['weekSummary', 'totalTSS', 'days']
}

export async function runGenerateWeeklyPlan(payload: {
  userId: string
  startDate?: Date | string
  daysToPlan?: number
  userInstructions?: string
  trainingWeekId?: string
  anchorWorkoutIds?: string[]
  proposalOnly?: boolean
  replacementContext?: {
    boundary: string
    end: string
    eligibleDays: string[]
    remainingVolumeMinutes: number
    remainingSportVolumeTargets?: SportVolumeTargets | null
    remainingTSS: number
    committedMinutes: number
    committedTSS: number
  }
}) {
  const { userId, userInstructions, trainingWeekId, anchorWorkoutIds } = payload
  const daysToPlan =
    typeof payload.daysToPlan === 'number' && Number.isFinite(payload.daysToPlan)
      ? payload.daysToPlan
      : 7

  logger.log('Starting weekly plan generation', {
    userId,
    startDate: payload.startDate,
    daysToPlan,
    userInstructions,
    trainingWeekId,
    anchorWorkoutIds
  })

  // Check Quota
  try {
    await checkQuota(userId, 'weekly_plan_generation')
  } catch (quotaError: any) {
    if (quotaError.statusCode === 429) {
      logger.warn('Weekly plan generation quota exceeded', { userId })
      return { success: false, reason: 'QUOTA_EXCEEDED' }
    }
    throw quotaError
  }

  const timezone = await getUserTimezone(userId)
  const aiSettings = await getUserAiSettings(userId)

  logger.log('Using AI settings', {
    model: aiSettings.aiModelPreference,
    persona: aiSettings.aiPersona
  })

  // Parse startDate. If string, treat as local day. If Date, treat as... well, Date.
  // Assuming input is the start of the week user wants to plan for.
  // If startDate is 2026-01-08 (Thursday), we might want to align to Monday or start from there.
  // The original code adjusted to Monday. Let's keep that logic but using timezone helpers.
  // Redis/BullMQ JSON payloads revive Dates as ISO strings; missing values default to today.
  const parsedStartDate = payload.startDate ? new Date(payload.startDate) : null
  const inputDate =
    parsedStartDate && !Number.isNaN(parsedStartDate.getTime())
      ? parsedStartDate
      : getUserLocalDate(timezone)
  // Find the start of that day in UTC for the user's timezone
  const startOfDayUTC = getStartOfDayUTC(timezone, inputDate)

  // Calculate week boundaries (Monday aligned)
  // We convert to zoned time to get the day of week in local time
  // But since we have helper functions, maybe we can simplify.
  // Let's stick to the existing logic but ensure boundaries are UTC.

  // Original logic:
  // const day = weekStart.getDay();
  // const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);

  // We need to do this adjustment in "Local Time" domain, then convert back to UTC.
  // Or just use the inputDate if it's already aligned?
  // Let's assume inputDate IS the start date requested.
  // But the code says "Adjust to Monday".

  // Safe approach: Use the existing logic but on the Date object derived from timezone.
  // Actually, getStartOfDayUTC gives us a UTC timestamp that represents 00:00 Local.
  // So `weekStart` (UTC) = 00:00 Local.

  const weekStart = new Date(startOfDayUTC)
  // Adjust to Monday relative to the DATE value (which is shifted in UTC)
  // Wait, if I'm in UTC+9, 00:00 Local is 15:00 Prev Day UTC.
  // `weekStart.getDay()` will return the day of week in LOCAL time? No, in browser/server local.
  // Server is UTC. So `weekStart.getDay()` returns day in UTC.
  // 15:00 Prev Day is likely the day before.
  // This logic is tricky.

  // Better approach: Use formatted string to get local day of week.
  const localDateStr = formatUserDate(weekStart, timezone, 'yyyy-MM-dd')
  const [y, m, d] = localDateStr.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`Invalid local date: ${localDateStr}`)
  }
  const localDateObj = new Date(Date.UTC(y, m - 1, d)) // UTC midnight for calculation
  const day = localDateObj.getUTCDay()
  const diff = localDateObj.getUTCDate() - day + (day === 0 ? -6 : 1)
  localDateObj.setUTCDate(diff)

  // Now convert that back to UTC start of day
  // Since localDateObj is already UTC-aligned to the date we want, and getStartOfDayUTC expects a date object...
  // Actually getStartOfDayUTC takes "any time in that day".
  // localDateObj is UTC midnight. If we pass it to getStartOfDayUTC(timezone), it interprets 00:00 UTC as the time.
  // This is WRONG if we just want "The Start of This Calendar Date".
  // We already have the calendar date in `localDateStr` logic.
  // `alignedWeekStart` should be the UTC timestamp for 00:00 User Time on that date.
  let alignedWeekStart = getStartOfDayUTC(timezone, localDateObj)
  // Wait, getStartOfDayUTC(timezone, 2026-01-12T00:00:00Z)
  // If user is UTC+9. 00:00 UTC is 09:00 User Time.
  // Start of day is 00:00 User Time (15:00 prev day UTC).
  // So getStartOfDayUTC is correct.

  let effectiveDaysToPlan = daysToPlan
  const alignedWeekEnd = new Date(alignedWeekStart)
  alignedWeekEnd.setUTCDate(alignedWeekEnd.getUTCDate() + (effectiveDaysToPlan - 1))
  // Set to end of day in local time -> UTC
  let alignedWeekEndUTC = getEndOfDayUTC(timezone, alignedWeekEnd)

  if (trainingWeekId) {
    const trainingWeek = await prisma.trainingWeek.findUnique({
      where: { id: trainingWeekId }
    })
    if (trainingWeek) {
      alignedWeekStart = getStartOfDayUTC(timezone, trainingWeek.startDate)
      alignedWeekEndUTC = getEndOfDayUTC(timezone, trainingWeek.endDate)
      const alignedWeekEndStart = getStartOfDayUTC(timezone, trainingWeek.endDate)
      const dayMs = 24 * 60 * 60 * 1000
      effectiveDaysToPlan =
        Math.round((alignedWeekEndStart.getTime() - alignedWeekStart.getTime()) / dayMs) + 1
    } else {
      logger.warn('trainingWeekId provided but not found, using payload dates', {
        trainingWeekId
      })
    }
  }

  logger.log('Week boundaries calculated (Timezone Aware)', {
    timezone,
    weekStart: alignedWeekStart.toISOString(),
    weekEnd: alignedWeekEndUTC.toISOString(),
    localStart: formatUserDate(alignedWeekStart, timezone),
    localEnd: formatUserDate(alignedWeekEndUTC, timezone),
    daysToPlan: effectiveDaysToPlan
  })

  // Fetch user data
  const [
    user,
    availability,
    recentWorkouts,
    recentWellness,
    currentPlan,
    athleteProfile,
    rawActiveGoals,
    existingPlannedWorkouts,
    sportSettings,
    primarySport,
    openInjuries
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        ftp: true,
        weight: true,
        weightUnits: true,
        height: true,
        heightUnits: true,
        maxHr: true,
        lthr: true,
        dob: true,
        sex: true,
        language: true
      }
    }),
    availabilityRepository.getFullSchedule(userId),
    workoutRepository.getForUser(userId, {
      startDate: getStartOfDaysAgoUTC(timezone, 14), // Last 14 days relative to today
      endDate: payload.proposalOnly ? new Date() : alignedWeekStart,
      limit: 10,
      orderBy: { date: 'desc' },
      includeDuplicates: false
    }),
    wellnessRepository.getForUser(userId, {
      startDate: getStartOfDaysAgoUTC(timezone, 7), // Last 7 days
      endDate: payload.proposalOnly ? new Date() : alignedWeekStart,
      limit: 7,
      orderBy: { date: 'desc' }
    }),
    prisma.weeklyTrainingPlan.findFirst({
      where: {
        userId,
        weekStartDate: alignedWeekStart
      }
    }),

    // Latest athlete profile
    prisma.report.findFirst({
      where: {
        userId,
        type: 'ATHLETE_PROFILE',
        status: 'COMPLETED'
      },
      orderBy: { createdAt: 'desc' },
      select: { analysisJson: true, createdAt: true }
    }),

    // Active goals
    prisma.goal.findMany({
      where: {
        userId,
        status: 'ACTIVE'
      },
      orderBy: { priority: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        metric: true,
        currentValue: true,
        targetValue: true,
        targetDate: true,
        eventDate: true,
        eventType: true,
        priority: true,
        aiContext: true
      }
    }),

    // Existing planned workouts for this week (by Date OR by TrainingWeek ID)
    prisma.plannedWorkout.findMany({
      where: {
        userId,
        OR: [
          {
            date: {
              gte: alignedWeekStart,
              lte: alignedWeekEndUTC
            }
          },
          ...(trainingWeekId ? [{ trainingWeekId }] : [])
        ]
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        title: true,
        description: true,
        type: true,
        durationSec: true,
        distanceMeters: true,
        tss: true,
        targetArea: true,
        managedBy: true,
        completed: true
      }
    }),

    // Sport Specific Settings
    sportSettingsRepository.getByUserId(userId),

    // Coach brain: primary sport (voice + principles) and logged injuries
    getAthletePrimarySport(userId),
    fetchOpenInjuries(userId)
  ])

  if (!user) {
    throw new Error('User not found')
  }

  const activeGoals = filterGoalsForContext(rawActiveGoals, timezone, alignedWeekStart)

  // Calculate Age
  const userAge = calculateAge(user?.dob)

  // Split into Anchors and Context
  const anchoredWorkouts = existingPlannedWorkouts.filter((w) => anchorWorkoutIds?.includes(w.id))
  const contextWorkouts = existingPlannedWorkouts.filter((w) => !anchorWorkoutIds?.includes(w.id))

  logger.log('Workouts classified', {
    anchored: anchoredWorkouts.length,
    context: contextWorkouts.length
  })

  logger.log('Existing workouts fetched details', {
    count: existingPlannedWorkouts.length,
    workouts: existingPlannedWorkouts.map((w) => ({
      date: w.date.toISOString(),
      title: w.title,
      id: w.id
    }))
  })

  logger.log('Data fetched', {
    hasUser: !!user,
    availabilityDays: availability.length,
    recentWorkoutsCount: recentWorkouts.length,
    recentWellnessCount: recentWellness.length,
    hasExistingPlan: !!currentPlan,
    hasAthleteProfile: !!athleteProfile,
    activeGoals: activeGoals.length,
    sportProfiles: sportSettings.length
  })

  // Build availability summary
  const availabilitySummary = availabilityRepository.formatForPrompt(availability)

  // Calculate recent training load
  const recentTSS = recentWorkouts.reduce((sum, w) => sum + (w.tss || 0), 0)
  const avgRecovery =
    recentWellness.length > 0
      ? recentWellness.reduce((sum, w) => sum + (w.recoveryScore || 50), 0) / recentWellness.length
      : 50

  // Generate training context for load management
  const thirtyDaysAgo = getStartOfDaysAgoUTC(timezone, 30)
  const trainingContext = await generateTrainingContext(
    userId,
    thirtyDaysAgo,
    getEndOfDayUTC(timezone, new Date()),
    {
      includeZones: false,
      timezone,
      adjustForTodayUncompletedPlannedTSS: true
    }
  )

  // Determine current training phase if a goal exists
  let phaseInstruction = ''
  const primaryGoal =
    activeGoals.find((g) => g.type === 'EVENT' && g.priority === 'HIGH') || activeGoals[0]

  // Fetch full Plan context if available (via trainingWeekId)
  let planContext = ''
  let weekVolumeTargetMinutes: number | null = null
  let sportVolumeTargets: SportVolumeTargets | null = null
  let resolvedTrainingWeekId = trainingWeekId
  const contextInclude = { block: { include: { plan: { include: { goal: true } } } } } as const
  const fullContext = trainingWeekId
    ? await prisma.trainingWeek.findUnique({
        where: { id: trainingWeekId },
        include: contextInclude
      })
    : await prisma.trainingWeek.findFirst({
        where: {
          block: { plan: { userId, status: 'ACTIVE' } },
          startDate: { lte: parseCalendarDate(formatUserDate(alignedWeekStart, timezone))! },
          endDate: { gte: parseCalendarDate(formatUserDate(alignedWeekEndUTC, timezone))! }
        },
        include: contextInclude
      })
  if (trainingWeekId && !fullContext) throw new Error('Training week not found')
  if (fullContext) {
    resolvedTrainingWeekId = fullContext.id
    weekVolumeTargetMinutes = fullContext.volumeTargetMinutes ?? null
    sportVolumeTargets = readSportVolumeTargets(fullContext.sportVolumeTargets)
    planContext = `
CONTEXT FROM MASTER PLAN:
- Plan Name: ${fullContext.block.plan.name || fullContext.block.plan.goal?.title || 'Custom Plan'}
- Current Block: "${fullContext.block.name}" (${fullContext.block.type} Phase)
- Block Focus: ${fullContext.block.primaryFocus}
- Current Week: Week ${fullContext.weekNumber} of ${fullContext.block.durationWeeks} in this block.
- Week Focus: ${fullContext.focus || 'Standard Progression'}
- Target Weekly Volume: ${Math.round(fullContext.volumeTargetMinutes / 60)} hours
- Target Weekly TSS: ${fullContext.tssTarget}
- Sport-specific minute ceilings: ${JSON.stringify(sportVolumeTargets || {})}. Unused cycling time cannot be spent running.
${formatMacroWeekForPrompt(fullContext.block.plan.progressionContext, fullContext.startDate)}
`
    // Override phase instruction with strict block context
    phaseInstruction = `\nCURRENT PHASE: ${fullContext.block.type}. Focus strictly on ${fullContext.block.primaryFocus}. This is Week ${fullContext.weekNumber} of the block.`
  }

  if (!phaseInstruction && primaryGoal) {
    const today = new Date()
    const goalDate = primaryGoal.eventDate || primaryGoal.targetDate

    if (goalDate) {
      const weeksToGoal = Math.ceil(
        (new Date(goalDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7)
      )

      // Extract phase preference from aiContext if available
      let preferredPhase = ''
      if (primaryGoal.aiContext?.includes('Phase Preference:')) {
        preferredPhase =
          primaryGoal.aiContext.split('Phase Preference:')[1]?.split('.')[0]?.trim() ?? ''
      }

      if (preferredPhase) {
        phaseInstruction = `\nUSER SPECIFIED PHASE: ${preferredPhase}. Focus the training plan strictly on this phase's objectives.`
      } else if (weeksToGoal > 12) {
        phaseInstruction = `\nRECOMMENDED PHASE: BASE. Focus on building aerobic foundation and muscular endurance.`
      } else if (weeksToGoal > 4) {
        phaseInstruction = `\nRECOMMENDED PHASE: BUILD. Focus on specificity, threshold, and race-intensity workouts.`
      } else if (weeksToGoal > 0) {
        phaseInstruction = `\nRECOMMENDED PHASE: SPECIALTY/PEAK. Focus on maximum specificity, race simulation, and tapering.`
      }
    }
  }

  // Calculate current and target TSS values
  const currentWeeklyTSS = trainingContext.loadTrend.weeklyTSSAvg
  const targetMinTSS = Math.round(currentWeeklyTSS * 1.05) // 5% increase
  const targetMaxTSS = Math.round(currentWeeklyTSS * 1.1) // 10% increase

  // Build athlete profile context
  let athleteContext: string
  if (athleteProfile?.analysisJson) {
    const profile = athleteProfile.analysisJson as any
    athleteContext = `
ATHLETE PROFILE (Generated ${formatUserDate(athleteProfile.createdAt, timezone)}):
${profile.executive_summary ? `Summary: ${profile.executive_summary}` : ''}

Current Fitness: ${profile.current_fitness?.status_label || 'Unknown'}
${profile.current_fitness?.key_points ? profile.current_fitness.key_points.map((p: string) => `- ${p}`).join('\n') : ''}

Training Characteristics:
${profile.training_characteristics?.training_style || 'No data'}
Strengths: ${profile.training_characteristics?.strengths?.join(', ') || 'None listed'}
Areas for Development: ${profile.training_characteristics?.areas_for_development?.join(', ') || 'None listed'}

Recovery Profile: ${profile.recovery_profile?.recovery_pattern || 'Unknown'}
${profile.recovery_profile?.key_observations ? profile.recovery_profile.key_observations.map((o: string) => `- ${o}`).join('\n') : ''}

Recent Performance Trend: ${profile.recent_performance?.trend || 'Unknown'}
${profile.recent_performance?.patterns ? profile.recent_performance.patterns.map((p: string) => `- ${p}`).join('\n') : ''}

Planning Context:
${profile.planning_context?.current_focus ? `Current Focus: ${profile.planning_context.current_focus}` : ''}
${profile.planning_context?.limitations?.length ? `Limitations: ${profile.planning_context.limitations.join(', ')}` : ''}
${profile.planning_context?.opportunities?.length ? `Opportunities: ${profile.planning_context.opportunities.join(', ')}` : ''}

Recommendations Summary:
${profile.recommendations_summary?.recurring_themes?.length ? `Themes: ${profile.recommendations_summary.recurring_themes.join('; ')}` : ''}
${profile.recommendations_summary?.action_items?.length ? `Priority Actions:\n${profile.recommendations_summary.action_items.map((a: any) => `- [${a.priority}] ${a.action}`).join('\n')}` : ''}
`
  } else {
    athleteContext = `
USER BASIC INFO:
- Age: ${userAge || 'Unknown'}
- Sex: ${user?.sex || 'Unknown'}
- Height: ${formatPromptHeight(user?.height, user?.heightUnits)}
- Global FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${formatPromptWeight(user?.weight, user?.weightUnits)}
- Global Max HR: ${user?.maxHr || 'Unknown'} bpm
Note: No structured athlete profile available yet. Consider generating one for better personalized planning.
`
  }

  // Add Sport Specific Settings & Thresholds
  if (sportSettings.length > 0) {
    athleteContext += '\nSPORT SPECIFIC SETTINGS & THRESHOLDS:\n'
    athleteContext +=
      'The athlete has different thresholds for different sports. Use these when planning specific activities.\n'
    for (const s of sportSettings) {
      const types = s.isDefault ? 'Fallback' : s.types.join(', ')
      athleteContext += `- **${s.name || (s.isDefault ? 'Default' : 'Sport')}** (${types}): FTP=${s.ftp || 'N/A'}W, LTHR=${s.lthr || 'N/A'}bpm, MaxHR=${s.maxHr || 'N/A'}bpm\n`

      if (s.hrZones && Array.isArray(s.hrZones)) {
        athleteContext +=
          '  * HR Zones: ' +
          s.hrZones.map((z: any) => `${z.name} (${z.min}-${z.max})`).join(', ') +
          '\n'
      }
      if (s.powerZones && Array.isArray(s.powerZones)) {
        athleteContext +=
          '  * Power Zones: ' +
          s.powerZones.map((z: any) => `${z.name} (${z.min}-${z.max})`).join(', ') +
          '\n'
      }
    }
  }

  // Add goals context
  if (activeGoals.length > 0) {
    athleteContext += `

CURRENT GOALS:
${activeGoals
  .map((g) => {
    const daysToTarget = g.targetDate
      ? Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null
    const daysToEvent = g.eventDate
      ? Math.ceil((new Date(g.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null

    let goalInfo = `- [${g.priority}] ${g.title} (${g.type})`
    if (g.description) goalInfo += `\n  ${g.description}`
    if (g.metric && g.targetValue) {
      goalInfo += `\n  Target: ${g.metric} = ${g.targetValue}`
      if (g.currentValue) goalInfo += ` (Current: ${g.currentValue})`
    }
    if (daysToTarget) goalInfo += `\n  Timeline: ${daysToTarget} days remaining`
    if (daysToEvent)
      goalInfo += `\n  Event: ${g.eventType || 'race'} on ${formatUserDate(g.eventDate!, timezone)} (${daysToEvent} days)`
    if (g.aiContext) goalInfo += `\n  Context: ${g.aiContext}`

    return goalInfo
  })
  .join('\n\n')}
`
  } else {
    athleteContext += `

CURRENT GOALS:
No active goals set. Plan for general fitness maintenance and improvement.
`
  }

  // Build prompt
  const injuryContext = formatInjuriesForPrompt(openInjuries, {
    today: getUserLocalDate(timezone)
  })

  let prompt = `${buildCoachRoleIntro({
    persona: aiSettings.aiPersona,
    sport: primarySport,
    task: `creating a personalized ${effectiveDaysToPlan}-day training plan.`
  })}
Adapt your planning strategy and reasoning to match your **${aiSettings.aiPersona}** persona.
Preferred Language: ${user?.language || 'English'} (CRITICAL: ALL summaries, reasoning, and workout descriptions MUST be written in this language)

${phaseInstruction}
${planContext}

${athleteContext}

${aiSettings.aiContext ? `USER PROVIDED CONTEXT / ABOUT ME / SPECIAL INSTRUCTIONS:\n${aiSettings.aiContext}\n` : ''}

TRAINING AVAILABILITY (when user can train):
${availabilitySummary || 'No availability set - assume flexible schedule'}

USER INSTRUCTIONS (HIGHEST PRIORITY):
${userInstructions ? `"${userInstructions}"\n\nUse these preferences only within server-owned prescription, injury, progression and availability constraints.` : 'No special instructions.'}

LOCKED/ANCHOR WORKOUTS (DO NOT CHANGE OR REPLACE):
${
  anchoredWorkouts.length > 0
    ? anchoredWorkouts
        .map(
          (w) =>
            `- ${formatDateUTC(w.date)}: ${w.title} (${w.type}, ${Math.round((w.durationSec || 0) / 60)}min) - KEEP THIS.`
        )
        .join('\n')
    : 'None'
}

CURRENT PLANNED WORKOUTS (Context - will be replaced unless anchored):
${
  contextWorkouts.length > 0
    ? contextWorkouts
        .map(
          (w) =>
            `- ${formatDateUTC(w.date)}: ${w.title} (${w.type}, ${Math.round((w.durationSec || 0) / 60)}min)`
        )
        .join('\n')
    : 'None'
}

${formatTrainingContextForPrompt(trainingContext)}

RECENT TRAINING (Last 14 days):
${
  recentWorkouts
    .slice(0, 3)
    .map(
      (w) =>
        `${formatUserDate(w.date, timezone)}: ${w.title} (TSS: ${w.tss || 'N/A'}, ${Math.round(w.durationSec / 60)}min)`
    )
    .join(', ') || 'No recent workouts'
}

${injuryContext}

RECENT RECOVERY (Last 7 days):
- Average recovery score: ${avgRecovery.toFixed(0)}%
- Latest HRV (rMSSD): ${recentWellness[0]?.hrv || 'N/A'} ms
- Latest resting HR: ${recentWellness[0]?.restingHr || 'N/A'} bpm

PLANNING PERIOD:
- Start: ${formatUserDate(alignedWeekStart, timezone)} (YYYY-MM-DD)
- End: ${formatUserDate(alignedWeekEndUTC, timezone)} (YYYY-MM-DD)
- Days to plan: ${effectiveDaysToPlan}

INSTRUCTIONS:
1. **PRIORITIZE USER INSTRUCTIONS**: If the user asks for specific changes (e.g., "no rides this week"), STRICTLY follow them, even if it contradicts standard training principles.
2. **RESPECT LOCKED WORKOUTS**: You MUST include the "LOCKED/ANCHOR WORKOUTS" in your plan on their specific days. Do not schedule conflicting workouts on those days unless it's a multi-session day (e.g. gym + ride). Account for their TSS in the weekly total.
3. **RESPECT AVAILABILITY**: Do not schedule workouts on days marked as "rest day" or conflicting with time slots unless the User Instructions explicitly override this.
4. **WORKOUT TYPES**:
   - USE ONLY: Ride, Run, Gym, Swim, Rest.
   - **DO NOT USE**: "Workout", "Active Recovery", or other generic types. Map recovery sessions to a light "Ride" or "Run" or "Rest".
   - "Gym" means strength training.
5. **PROGRESSION**:
   - If User Instructions are absent/minimal, aim for progressive overload based on the current phase.
   - Weekly TSS target: ${targetMinTSS} - ${targetMaxTSS} (unless overridden by instructions). Go lower for a recovery week (every 3-4 weeks), an active injury, or clear accumulated fatigue.
6. **INTENSITY DISTRIBUTION**:
   - Keep the week polarized or pyramidal unless user constraints dictate otherwise.
   - Avoid stacking hard days back-to-back unless explicitly requested.
   - Place key sessions where recovery before/after is feasible.
7. **RECOVERY MANAGEMENT**:
   - Use recovery markers and recent load to reduce volume/intensity when risk is elevated.
   - Ensure at least one clear low-stress day after very hard sessions.
8. **SESSION QUALITY**:
   - Each workout should have a clear objective (recovery, endurance, threshold, VO2, strength, race-specific).
   - Avoid generic filler workouts with no clear purpose.
9. **CONTEXT**: Consider the "Current Planned Workouts" to understand what the user is replacing or modifying.
10. **MULTI-SPORT THRESHOLDS**: When planning a specific sport (e.g. Run), refer to the sport-specific FTP/LTHR if provided in the context.
11. **SPORT**: The athlete's primary sport is ${getSportLabel(primarySport)}. Build the week around it unless the user instructions, goals or locked workouts say otherwise; use other sports deliberately (cross-training, strength), not by default.
12. **INJURIES**: Respect the "ACTIVE INJURIES & NIGGLES" above. For an ACTIVE injury with pain >= 4/10, do not schedule sessions that load the affected area in the affected sport: use cross-training that doesn't load it, reduce volume/intensity, or rest, and say so in reasoningText. RECOVERING injuries: progress the affected sport gradually (e.g. short easy sessions, no big jumps). Mention the injury in weekSummary when it shapes the week.
13. **STRENGTH**: Include ~2 short strength sessions ("Gym", 20-40 min) per week when availability allows, unless an injury, the athlete's existing routine or the user instructions say otherwise.${
    activeGoals.some((g) => g.eventType === 'Social Ride') ||
    existingPlannedWorkouts.some((w) => w.title?.toLowerCase().includes('social ride'))
      ? '\n14. **Social Ride**: Prioritize "Mental Freshness" and "Aerobic Base" over "Intensity". These should be low-intensity, community-focused rides.'
      : ''
  }${
    activeGoals.some((g) => g.eventType === 'Cyclotour') ||
    existingPlannedWorkouts.some(
      (w) =>
        w.title?.toLowerCase().includes('cyclotour') || w.title?.toLowerCase().includes('toertocht')
    )
      ? '\n15. **Cyclotour (Toertocht)**: Treat these as "Priority B or C" events. They require a mini-taper (2-3 days of reduced volume/intensity leading up to the event) and a focused fueling plan due to their long duration, even if they aren\'t competitive races.'
      : ''
  }${
    activeGoals.some((g) => g.eventType === 'Criterium') ||
    existingPlannedWorkouts.some((w) => w.title?.toLowerCase().includes('criterium'))
      ? '\n16. **Criterium**: Prioritize anaerobic capacity, high-intensity intervals (VO2 Max), and repeated sprint efforts. Focus on repeatability.'
      : ''
  }${
    activeGoals.some((g) => g.eventType === 'Time Trial') ||
    existingPlannedWorkouts.some((w) => w.title?.toLowerCase().includes('time trial'))
      ? '\n17. **Time Trial**: Focus on sustained threshold power (FTP), steady-state intervals, and pacing discipline.'
      : ''
  }${
    activeGoals.some((g) => g.eventType === 'Road Race') ||
    existingPlannedWorkouts.some((w) => w.title?.toLowerCase().includes('road race'))
      ? '\n18. **Road Race**: Emphasize aerobic volume, sweet spot endurance, and the ability to handle repeatable surges.'
      : ''
  }${
    activeGoals.some((g) => g.eventType === 'Gran Fondo') ||
    existingPlannedWorkouts.some((w) => w.title?.toLowerCase().includes('gran fondo'))
      ? '\n19. **Gran Fondo**: Prioritize muscular endurance (low cadence work), long climbs, and overall aerobic durability.'
      : ''
  }


${buildCoachingPrinciples(primarySport)}

Create a structured, progressive plan for the next ${effectiveDaysToPlan} days.
Maintain your **${aiSettings.aiPersona}** persona throughout the plan's reasoning and descriptions.`

  if (payload.proposalOnly && payload.replacementContext) {
    const replacement = payload.replacementContext
    prompt += `\n\nPARTIAL-WEEK RECALCULATION — MANDATORY REPLACEMENT CONTRACT:
The earlier full-week instructions are context only. Generate a proposal ONLY for these eligible calendar days: ${replacement.eligibleDays.join(', ')}.
Keep all locked sessions and every session through today unchanged. Do NOT include them in days.
Committed completed/preserved load: ${replacement.committedMinutes} minutes, ${replacement.committedTSS} TSS.
Remaining sport-specific minute ceilings: ${JSON.stringify(replacement.remainingSportVolumeTargets || {})}. Do not spend another sport’s budget on running.
Remaining weekly budget: at most ${replacement.remainingVolumeMinutes} minutes and ${replacement.remainingTSS} TSS across ALL proposed days combined.
Cover every eligible day exactly once; explicitly use Rest with 0 minutes and 0 TSS when appropriate.
Respect availability and slot duration limits. These restrictions cannot be overridden by user instructions.
Retain the current block and week focus. Return actual replacement sessions, never an empty days array.`
  }

  logger.log(`Generating plan with Gemini (${aiSettings.aiModelPreference})`)

  // Log prompt instructions for debugging
  const instructionStart = prompt.indexOf('INSTRUCTIONS:')
  logger.log('Prompt Instructions sent to AI', {
    instructions:
      instructionStart > -1
        ? prompt.substring(instructionStart)
        : 'Instructions not found in prompt',
    userInstructions: userInstructions || 'None'
  })

  const generatePlan = (promptText: string) =>
    generateStructuredAnalysis(promptText, weeklyPlanSchema, aiSettings.aiModelPreference, {
      userId,
      operation: 'weekly_plan_generation',
      entityType: 'WeeklyTrainingPlan',
      entityId: undefined
    })

  let plan = await generatePlan(prompt)

  // Recalculation validates and persists the complete replacement in its own transaction.
  // No schedule writes or external publication are allowed while preparing a proposal.
  if (payload.proposalOnly) {
    return { success: true, proposal: plan }
  }

  // Validate the generated week against the plan week's volume budget (when linked)
  // and duration sanity bounds. One corrective retry, then deterministic clamping,
  // mirroring generate-training-block. (CW-319)
  const daysToBlockWeek = (days: any[]): GeneratedBlockWeek => ({
    weekNumber: 1,
    workouts: days.map((d: any) => ({
      dayOfWeek: parseCalendarDate(d.date)?.getUTCDay() ?? d.dayOfWeek ?? 0,
      title: d.title,
      type: d.workoutType,
      durationMinutes: d.durationMinutes,
      tssEstimate: d.targetTSS
    }))
  })
  const [plannedForBudget, completedForBudget] =
    sportVolumeTargets && fullContext
      ? await Promise.all([
          prisma.plannedWorkout.findMany({
            where: { userId, date: { gte: fullContext.startDate, lte: fullContext.endDate } },
            select: {
              id: true,
              date: true,
              type: true,
              durationSec: true,
              managedBy: true,
              completed: true
            }
          }),
          prisma.workout.findMany({
            where: {
              userId,
              isDuplicate: false,
              date: {
                gte: getStartOfLocalDateUTC(timezone, formatDateUTC(fullContext.startDate)),
                lte: getEndOfLocalDateUTC(timezone, formatDateUTC(fullContext.endDate))
              }
            },
            select: { date: true, type: true, durationSec: true, plannedWorkoutId: true }
          })
        ])
      : [[], []]
  // Implicit partial-week generation only replaces its requested date range.
  // Unfinished AI sessions elsewhere in the linked week also consume the budget.
  const outsideReplacementIds = trainingWeekId
    ? []
    : plannedForBudget
        .filter((w) => w.date < alignedWeekStart || w.date > alignedWeekEndUTC)
        .map((w) => w.id)
  const preservedForBudget = sportVolumeTargets
    ? committedProgressionSessions(plannedForBudget, completedForBudget, [
        ...(anchorWorkoutIds || []),
        ...outsideReplacementIds
      ])
    : anchoredWorkouts
  const budgets = remainingProgressionBudgets(
    weekVolumeTargetMinutes,
    sportVolumeTargets,
    preservedForBudget
  )
  const protectedCalendarDays = new Set(
    preservedForBudget.map((w) => progressionSessionDay(w, timezone))
  )
  const anchoredDays = new Set(
    [...protectedCalendarDays].map((day) => parseCalendarDate(day)!.getUTCDay())
  )
  const weekTargets: WeekVolumeTarget[] = [
    {
      weekNumber: 1,
      ...budgets,
      allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6].filter((day) => !anchoredDays.has(day)),
      availability
    }
  ]

  let planDays: any[] = Array.isArray((plan as any)?.days) ? (plan as any).days : []
  let volumeViolations = validateGeneratedBlockWeeks([daysToBlockWeek(planDays)], weekTargets)
  if (volumeViolations.length > 0) {
    logger.warn('Generated week violates volume budget, retrying with feedback', {
      violations: volumeViolations.map((v) => v.message)
    })

    const retryPlan = await generatePlan(
      `${prompt}\n\n${formatViolationsFeedback(volumeViolations)}`
    )
    if (Array.isArray((retryPlan as any)?.days) && (retryPlan as any).days.length > 0) {
      plan = retryPlan
      planDays = (plan as any).days
      volumeViolations = validateGeneratedBlockWeeks([daysToBlockWeek(planDays)], weekTargets)
    }

    if (volumeViolations.length > 0) {
      const { weeks: clampedWeeks, adjustments } = clampGeneratedBlockWeeks(
        [daysToBlockWeek(planDays)],
        weekTargets
      )
      const clampedWorkouts = clampedWeeks[0]?.workouts || []
      planDays.forEach((d: any, i: number) => {
        const clamped = clampedWorkouts[i]
        if (!clamped) return
        d.workoutType = clamped.type
        if (clamped.type === 'Rest') {
          d.title = 'Rest'
          d.description = clamped.description
          d.reasoningText = clamped.description
          delete d.distanceMeters
        }
        d.durationMinutes = clamped.durationMinutes
        if (typeof clamped.tssEstimate === 'number') d.targetTSS = clamped.tssEstimate
      })
      ;(plan as any).totalTSS = planDays.reduce(
        (sum: number, d: any) => sum + (d.targetTSS || 0),
        0
      )
      logger.warn('Retry still over budget - clamped generated week deterministically', {
        adjustments
      })
    }
  }

  const residualViolations = validateGeneratedBlockWeeks(
    [daysToBlockWeek(planDays)],
    weekTargets.filter((target) => target.sportVolumeTargets)
  )
  if (residualViolations.length) throw new Error(formatViolationsFeedback(residualViolations))

  logger.log('Plan generated from AI', {
    daysPlanned: (plan as any).days?.length,
    days: (plan as any).days?.map((d: any) => ({ date: d.date, type: d.workoutType })),
    totalTSS: (plan as any).totalTSS
  })

  // Save or update the plan
  const planData = {
    userId,
    weekStartDate: alignedWeekStart,
    weekEndDate: alignedWeekEndUTC,
    daysPlanned: effectiveDaysToPlan,
    status: 'ACTIVE',
    generatedBy: 'AI',
    modelVersion: aiSettings.aiModelPreference,
    planJson: { ...(plan as any), coachingEvidenceVersion: COACHING_EVIDENCE_VERSION },
    totalTSS: (plan as any).totalTSS,
    totalDuration: Array.isArray((plan as any)?.days)
      ? (plan as any).days.reduce((sum: number, d: any) => sum + (d.durationMinutes || 0) * 60, 0)
      : 0,
    workoutCount: Array.isArray((plan as any)?.days)
      ? (plan as any).days.filter((d: any) => d.workoutType !== 'Rest').length
      : 0
  }

  // Check if the plan still exists if we intend to update it
  let finalCurrentPlan = currentPlan
  if (currentPlan) {
    const exists = await prisma.weeklyTrainingPlan.findUnique({
      where: { id: currentPlan.id },
      select: { id: true }
    })
    if (!exists) {
      logger.warn(
        'Weekly plan was deleted during generation, will create new instead of updating',
        {
          planId: currentPlan.id
        }
      )
      finalCurrentPlan = null
    }
  }

  if (
    planDays.some(
      (d: any) =>
        d.date < formatDateUTC(alignedWeekStart) || d.date > formatDateUTC(alignedWeekEndUTC)
    )
  )
    throw new Error('Generated prescription contains a date outside the requested week.')

  const candidates = planDays
    .filter((d: any) => !protectedCalendarDays.has(d.date))
    .map((d: any) => ({
      id: randomUUID(),
      userId,
      date: new Date(`${d.date}T00:00:00Z`),
      title: d.title,
      description: d.description + (d.reasoningText ? `\n\nReasoning: ${d.reasoningText}` : ''),
      type: normalizeGeneratedWorkoutType(d.workoutType),
      durationSec: Math.round((d.durationMinutes || 0) * 60),
      distanceMeters: d.distanceMeters,
      tss: d.targetTSS,
      targetArea: d.targetArea,
      workIntensity:
        d.intensity === 'recovery'
          ? 0.5
          : d.intensity === 'easy'
            ? 0.6
            : d.intensity === 'moderate'
              ? 0.75
              : d.intensity === 'hard'
                ? 0.9
                : d.intensity === 'very_hard'
                  ? 1
                  : null,
      category: 'WORKOUT',
      externalId: `ai_gen_${userId}_${d.date}_${randomUUID()}`,
      syncStatus: 'LOCAL_ONLY',
      managedBy: 'COACH_WATTS'
    }))
  const uploadAfterCommit: any[] = []
  const savedPlan = await prisma.$transaction(
    async (tx) => {
      await lockPrescriptionSchedule(tx, userId)
      const cleanupScope = buildWorkoutCleanupQuery({
        userId,
        startDate: alignedWeekStart,
        endDate: alignedWeekEndUTC,
        trainingWeekId,
        anchorWorkoutIds
      })
      const existing = await tx.plannedWorkout.findMany({ where: cleanupScope })
      const replaceIds = existing
        .filter((w) => w.managedBy === 'COACH_WATTS' && !isProtectedPrescriptionSession(w))
        .map((w) => w.id)
      const assessment = await validatePrescriptionWrite(tx, userId, candidates, {
        source: 'weekly-generation',
        replaceIds
      })
      const savedPlan = finalCurrentPlan
        ? await tx.weeklyTrainingPlan.update({
            where: { id: finalCurrentPlan.id },
            data: {
              ...planData,
              updatedAt: new Date()
            }
          })
        : await tx.weeklyTrainingPlan.create({
            data: planData
          })

      // Also update the individual planned workouts if this is an active plan
      if (savedPlan.status === 'ACTIVE') {
        // First, handle existing workouts
        const scope = buildWorkoutCleanupQuery({
          userId,
          startDate: alignedWeekStart,
          endDate: alignedWeekEndUTC,
          trainingWeekId,
          anchorWorkoutIds
        })

        // 1. Unlink User-Managed Workouts (preserve them)
        await tx.plannedWorkout.updateMany({
          where: {
            ...scope,
            managedBy: 'USER'
          },
          data: { trainingWeekId: null }
        })

        await retireReplacedPrescriptionExports(
          tx,
          userId,
          existing.filter((w) => replaceIds.includes(w.id))
        )
        // 2. Delete AI-Managed Workouts
        const deleted = await tx.plannedWorkout.deleteMany({
          where: { id: { in: replaceIds }, userId }
        })

        logger.log('Cleaned up existing planned workouts', {
          deleted: deleted.count,
          weekStart: alignedWeekStart.toISOString(),
          weekEnd: alignedWeekEndUTC.toISOString(),
          preservedAnchors: anchorWorkoutIds?.length || 0
        })

        // Insert new workouts from the generated plan
        const workoutsToCreate = candidates.map((w) => ({
          ...w,
          rawJson: withPrescriptionAssessment({}, assessment.id)
        }))

        logger.log('Workouts prepared for creation', {
          count: workoutsToCreate.length,
          data: workoutsToCreate
        })

        // Determine the TrainingWeek ID to link to
        let targetTrainingWeekId: string | undefined = resolvedTrainingWeekId
        let targetTrainingWeekRange:
          | {
              start: Date
              end: Date
            }
          | undefined

        // If explicitly passed, verify it exists and use it
        if (targetTrainingWeekId) {
          const verifiedWeek = await tx.trainingWeek.findUnique({
            where: { id: targetTrainingWeekId }
          })
          if (!verifiedWeek) {
            logger.warn('Explicitly passed trainingWeekId not found in DB', { trainingWeekId })
            targetTrainingWeekId = undefined // Fallback to search logic
          } else {
            targetTrainingWeekRange = {
              start: getStartOfDayUTC(timezone, verifiedWeek.startDate),
              end: getEndOfDayUTC(timezone, verifiedWeek.endDate)
            }
            logger.log('Using explicitly passed TrainingWeek ID', { trainingWeekId })
          }
        }

        // Only link the week whose budgets were resolved before proposal validation.

        if (workoutsToCreate.length > 0) {
          if (
            targetTrainingWeekId &&
            targetTrainingWeekRange &&
            alignedWeekStart >= targetTrainingWeekRange.start &&
            alignedWeekEndUTC <= targetTrainingWeekRange.end
          ) {
            logger.log('Linking generated workouts to TrainingWeek', {
              trainingWeekId: targetTrainingWeekId
            })
            workoutsToCreate.forEach((w: any) => {
              if (w) (w as any).trainingWeekId = targetTrainingWeekId
            })

            // Link Anchored Workouts to this week as well
            if (anchorWorkoutIds?.length && anchoredWorkouts.length > 0) {
              await tx.plannedWorkout.updateMany({
                where: { id: { in: anchorWorkoutIds } },
                data: { trainingWeekId: targetTrainingWeekId }
              })
              logger.log('Linked anchored workouts to TrainingWeek', {
                count: anchoredWorkouts.length,
                trainingWeekId: targetTrainingWeekId
              })
            }
          } else {
            logger.warn(
              'TrainingWeek range mismatch or missing - leaving generated workouts unlinked',
              {
                weekStart: alignedWeekStart.toISOString(),
                weekEnd: alignedWeekEndUTC.toISOString(),
                trainingWeekId: targetTrainingWeekId || null
              }
            )
          }

          // Use createMany but we need to match the type exactly.
          const result = await tx.plannedWorkout.createMany({
            data: workoutsToCreate as any
          })
          logger.log('Created workouts in DB', { count: result.count })

          const createdExternalIds = workoutsToCreate.map((w: any) => w?.externalId).filter(Boolean)
          if (createdExternalIds.length > 0) {
            const createdWorkouts = await tx.plannedWorkout.findMany({
              where: {
                userId,
                externalId: { in: createdExternalIds }
              },
              select: {
                id: true,
                userId: true,
                externalId: true,
                date: true,
                startTime: true,
                title: true,
                description: true,
                type: true,
                durationSec: true,
                tss: true,
                managedBy: true
              }
            })

            for (const workout of createdWorkouts) {
              uploadAfterCommit.push(workout)
            }
          }
        } else {
          logger.warn('No workouts to create found in plan')
        }
      }

      return savedPlan
    },
    { isolationLevel: 'Serializable', timeout: 40000 }
  )
  for (const workout of uploadAfterCommit)
    await autoUploadPlannedWorkoutToIntervalsIfEnabled(workout)

  logger.log('Plan saved', { planId: savedPlan.id })

  return {
    success: true,
    planId: savedPlan.id,
    userId,
    weekStart: alignedWeekStart.toISOString(),
    weekEnd: alignedWeekEndUTC.toISOString(),
    daysPlanned: effectiveDaysToPlan,
    totalTSS: savedPlan.totalTSS,
    workoutCount: savedPlan.workoutCount
  }
}

registerTaskHandler('generate-weekly-plan', runGenerateWeeklyPlan)

export const generateWeeklyPlanTask = task({
  id: 'generate-weekly-plan',
  maxDuration: 600,
  queue: userBackgroundQueue,
  run: async (payload: {
    userId: string
    startDate: Date
    daysToPlan: number
    userInstructions?: string
    trainingWeekId?: string
    anchorWorkoutIds?: string[]
  }) => {
    return runGenerateWeeklyPlan(payload)
  }
})
