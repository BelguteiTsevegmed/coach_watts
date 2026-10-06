export type AthleteArea = 'today' | 'training' | 'progress'

export interface AthleteDestination {
  key: string
  label: string
  to: string
  icon: string
}

export const athletePrimaryNavigation: AthleteDestination[] = [
  { key: 'today', label: 'Today', to: '/dashboard', icon: 'i-lucide-sun' },
  { key: 'training', label: 'Training', to: '/activities', icon: 'i-lucide-calendar-days' },
  { key: 'progress', label: 'Progress', to: '/performance', icon: 'i-lucide-trending-up' }
]

export function getAthleteArea(path: string): AthleteArea | null {
  const pathname = path.split(/[?#]/)[0] || '/'
  const isWithin = (root: string) => pathname === root || pathname.startsWith(`${root}/`)

  if (['/dashboard', '/nutrition', '/recommendations'].some(isWithin)) return 'today'
  if (['/performance', '/fitness', '/reports', '/analytics'].some(isWithin)) return 'progress'
  if (
    ['/activities', '/plan', '/plans', '/workouts', '/library', '/events', '/profile/goals'].some(
      isWithin
    )
  ) {
    return 'training'
  }
  return null
}

export function getAthleteContextNavigation(area: AthleteArea | null): AthleteDestination[] {
  if (area === 'training') {
    return [
      { key: 'week', label: 'Week', to: '/activities', icon: 'i-lucide-calendar-days' },
      { key: 'plan', label: 'Plan', to: '/plan', icon: 'i-lucide-route' },
      { key: 'history', label: 'History', to: '/workouts', icon: 'i-lucide-history' },
      { key: 'library', label: 'Library', to: '/library/workouts', icon: 'i-lucide-library' }
    ]
  }
  if (area === 'progress') {
    return [
      { key: 'overview', label: 'Overview', to: '/performance', icon: 'i-lucide-trending-up' },
      { key: 'fitness', label: 'Fitness', to: '/fitness', icon: 'i-lucide-heart-pulse' },
      { key: 'reports', label: 'Reports', to: '/reports', icon: 'i-lucide-file-text' }
    ]
  }
  return []
}
