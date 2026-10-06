/**
 * Default plan sports for the plan wizard, derived from the goal the athlete
 * picked: a half-marathon goal should not open a cycling plan. Returns null
 * when the goal says nothing about its sport, so the caller keeps its default.
 */
export function activityTypesForGoal(
  goal: { eventType?: string | null; type?: string | null; title?: string | null } | null
): string[] | null {
  if (!goal) return null
  const text = `${goal.eventType || ''} ${goal.title || ''}`.toLowerCase()
  if (!text.trim()) return null

  if (/triathlon|ironman|\b70\.3\b/.test(text)) return ['Swim', 'Ride', 'Run']
  if (/duathlon/.test(text)) return ['Ride', 'Run']
  if (/\brun\b|running|marathon|\b(5|10|21|42)\s?k\b|trail|ultra/.test(text)) return ['Run']
  if (/ride|cycling|bike|gran fondo|sportive|criterium|gravel|\bmtb\b|\bttt?\b/.test(text))
    return ['Ride']
  if (/swim/.test(text)) return ['Swim']
  return null
}
