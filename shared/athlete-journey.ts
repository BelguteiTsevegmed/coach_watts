/** One useful next step for today. The UI can expose detail without competing CTAs. */
export type TodayPhase =
  'loading' | 'error' | 'checkin' | 'prepare' | 'reflect' | 'complete' | 'rest' | 'unplanned'

export interface JourneyWorkout {
  id: string
  type?: string | null
  completed?: boolean | null
}

export interface JourneyCompletedWorkout {
  id: string
  plannedWorkoutId?: string | null
}

export function resolveTodayJourney(input: {
  loading: boolean
  loadError?: string | null
  checkinCompleted: boolean
  planned: JourneyWorkout[]
  completed: JourneyCompletedWorkout[]
}): {
  phase: TodayPhase
  nextWorkoutId: string | null
  reflectionWorkoutId: string | null
  remainingSessionCount: number
} {
  const linkedIds = new Set(
    input.completed.map((workout) => workout.plannedWorkoutId).filter(Boolean)
  )
  const remaining = input.planned.filter(
    (workout) => !workout.completed && !linkedIds.has(workout.id) && workout.type !== 'Note'
  )
  const sessions = remaining.filter((workout) => workout.type !== 'Rest')
  const result = {
    nextWorkoutId: sessions[0]?.id ?? null,
    reflectionWorkoutId: input.completed[0]?.id ?? null,
    remainingSessionCount: sessions.length
  }

  if (input.loading) return { ...result, phase: 'loading' }
  // A failed fetch is not evidence of a rest day or an empty calendar.
  if (input.loadError) return { ...result, phase: 'error' }
  if (sessions.length === 0 && input.completed.length > 0) return { ...result, phase: 'reflect' }
  if (
    sessions.length === 0 &&
    input.planned.some(
      (workout) => workout.completed && workout.type !== 'Rest' && workout.type !== 'Note'
    )
  )
    return { ...result, phase: 'complete' }
  if (!input.checkinCompleted) return { ...result, phase: 'checkin' }
  if (sessions.length > 0) return { ...result, phase: 'prepare' }
  if (remaining.some((workout) => workout.type === 'Rest')) return { ...result, phase: 'rest' }
  return { ...result, phase: 'unplanned' }
}
