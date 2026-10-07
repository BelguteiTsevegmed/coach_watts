/**
 * Single source of truth for the authenticated app navigation.
 *
 * Everything that renders navigation — the desktop sidebar, the mobile drawer,
 * the mobile bottom tab bar and the command palette "Go to" group — is derived
 * from `buildAppNavigation`. Add, rename or move destinations here, never in a
 * component.
 *
 * Information architecture (docs/06-plans/athlete-first-redesign.md):
 * - `primary`  — the four things an athlete opens the app for (bottom tab bar).
 * - `coaching` — the coach suite, only for people who coach someone.
 * - `more`     — secondary destinations: reachable, not in the way.
 * - `account`  — settings, help and admin tooling, pinned to the bottom.
 *
 * Kept free of Nuxt/Vue runtime imports so it can be unit tested in isolation.
 * Translation, analytics and closing the drawer are wired up in
 * `app/composables/useAppNavigation.ts`.
 */

export type AppNavSectionId = 'primary' | 'coaching' | 'more' | 'account'

export interface AppNavContext {
  /** Nutrition tracking is enabled for this athlete. */
  nutritionEnabled: boolean
  /** Legacy navigation input; billing is unavailable in this fork. */
  billingEnabled: boolean
  isAdmin: boolean
  /** Coaches at least one athlete (or has a pending request to). */
  isCoach: boolean
  /** Is connected to at least one coach of their own. */
  hasOwnCoach: boolean
}

export interface AppNavEntry {
  /** Stable identifier — also used as the accordion value and in tests. */
  id: string
  /** Key in the `common` i18n namespace. */
  labelKey: string
  /** English label rendered when the key is missing or i18n is not ready. */
  fallback: string
  icon: string
  to?: string
  /** Only highlight on an exact path match (e.g. `/coaching` overview). */
  exact?: boolean
  /** Extra path prefixes that belong to this destination. */
  match?: string[]
  children?: AppNavEntry[]
}

export interface AppNavSection {
  id: AppNavSectionId
  labelKey: string
  fallback: string
  items: AppNavEntry[]
}

/** The bottom tab bar shows the primary section plus a "More" button. */
export const PRIMARY_NAV_ENTRIES: readonly AppNavEntry[] = [
  {
    id: 'today',
    labelKey: 'navigation_today',
    fallback: 'Today',
    icon: 'i-lucide-sun',
    to: '/dashboard'
  },
  {
    id: 'calendar',
    labelKey: 'navigation_calendar',
    fallback: 'Calendar',
    icon: 'i-lucide-calendar-days',
    to: '/activities',
    // Planned sessions are opened from the calendar.
    match: ['/workouts/planned']
  },
  {
    id: 'progress',
    labelKey: 'navigation_progress',
    fallback: 'Progress',
    icon: 'i-lucide-trending-up',
    to: '/performance'
  },
  {
    id: 'coach',
    labelKey: 'navigation_coach',
    fallback: 'Coach',
    icon: 'i-lucide-message-circle',
    to: '/chat'
  }
]

const COACHING_SUITE_ENTRIES: readonly AppNavEntry[] = [
  {
    id: 'coaching-overview',
    labelKey: 'navigation_coaching_overview',
    fallback: 'Overview',
    icon: 'i-lucide-layout-dashboard',
    to: '/coaching',
    exact: true
  },
  {
    id: 'coaching-calendar',
    labelKey: 'navigation_coaching_calendar',
    fallback: 'Calendar',
    icon: 'i-lucide-calendar-days',
    to: '/coaching/calendar'
  },
  {
    id: 'coaching-athletes',
    labelKey: 'navigation_coaching_athletes',
    fallback: 'Athletes',
    icon: 'i-lucide-users-round',
    to: '/coaching/athletes'
  },
  {
    id: 'coaching-analytics',
    labelKey: 'navigation_analytics',
    fallback: 'Analytics',
    icon: 'i-lucide-bar-chart-3',
    to: '/analytics',
    exact: true
  },
  {
    id: 'coaching-team',
    labelKey: 'navigation_my_coaches',
    fallback: 'My coaches',
    icon: 'i-lucide-building-2',
    to: '/coaching/team',
    match: ['/coaching/teams']
  }
]

const LIBRARY_ENTRY: AppNavEntry = {
  id: 'library',
  labelKey: 'navigation_library',
  fallback: 'Library',
  icon: 'i-lucide-library',
  children: [
    {
      id: 'library-workouts',
      labelKey: 'navigation_library_workouts',
      fallback: 'Workouts',
      icon: 'i-lucide-activity',
      to: '/library/workouts'
    },
    {
      id: 'library-plans',
      labelKey: 'navigation_library_plans',
      fallback: 'Plans',
      icon: 'i-lucide-scroll-text',
      to: '/library/plans'
    },
    {
      id: 'library-exercises',
      labelKey: 'navigation_library_exercises',
      fallback: 'Exercises',
      icon: 'i-lucide-dumbbell',
      to: '/library/exercises'
    }
  ]
}

function cloneEntry(entry: AppNavEntry): AppNavEntry {
  return {
    ...entry,
    match: entry.match ? [...entry.match] : undefined,
    children: entry.children?.map(cloneEntry)
  }
}

function buildMoreEntries(ctx: AppNavContext): AppNavEntry[] {
  const entries: AppNavEntry[] = [
    {
      id: 'training-plan',
      labelKey: 'navigation_training_plan',
      fallback: 'Training plan',
      icon: 'i-lucide-calendar-range',
      to: '/plan'
    },
    {
      id: 'workout-history',
      labelKey: 'navigation_workout_history',
      fallback: 'Workout history',
      icon: 'i-lucide-history',
      to: '/workouts'
    },
    {
      id: 'goals',
      labelKey: 'navigation_goals_events',
      fallback: 'Goals & events',
      icon: 'i-lucide-trophy',
      to: '/profile/goals',
      match: ['/events']
    },
    {
      id: 'injuries',
      labelKey: 'navigation_injuries',
      fallback: 'Injuries',
      icon: 'i-lucide-bandage',
      to: '/injuries'
    },
    {
      id: 'recovery-fitness',
      labelKey: 'navigation_recovery_fitness',
      fallback: 'Recovery & fitness',
      icon: 'i-lucide-heart-pulse',
      to: '/fitness',
      match: ['/recovery']
    }
  ]

  if (ctx.nutritionEnabled) {
    entries.push({
      id: 'nutrition',
      labelKey: 'navigation_nutrition',
      fallback: 'Nutrition',
      icon: 'i-lucide-utensils',
      to: '/nutrition'
    })
  }

  entries.push(
    {
      id: 'reports',
      labelKey: 'navigation_reports',
      fallback: 'Reports',
      icon: 'i-lucide-file-text',
      to: '/reports',
      match: ['/report']
    },
    cloneEntry(LIBRARY_ENTRY)
  )

  if (!ctx.isCoach) {
    // Coaches get the full suite (incl. "My coaches") in its own section.
    entries.push(
      ctx.hasOwnCoach
        ? {
            id: 'my-coaches',
            labelKey: 'navigation_my_coaches',
            fallback: 'My coaches',
            icon: 'i-lucide-users',
            to: '/coaching/team',
            match: ['/coaching/teams']
          }
        : {
            // No coaching relationship either way: a single low-key entry keeps
            // the "connect a coach / an athlete" onboarding reachable.
            id: 'coaching',
            labelKey: 'navigation_coaching',
            fallback: 'Coaching',
            icon: 'i-lucide-users',
            to: '/coaching',
            exact: true
          }
    )
  }

  return entries
}

function buildAccountEntries(ctx: AppNavContext): AppNavEntry[] {
  const entries: AppNavEntry[] = [
    {
      id: 'settings',
      labelKey: 'navigation_settings_title',
      fallback: 'Settings',
      icon: 'i-lucide-settings',
      to: '/settings',
      match: ['/profile/settings', '/profile/athlete']
    },
    {
      id: 'help-center',
      labelKey: 'navigation_help_center',
      fallback: 'Help center',
      icon: 'i-lucide-circle-help',
      to: '/help-center'
    }
  ]

  if (ctx.isAdmin) {
    entries.push({
      id: 'admin',
      labelKey: 'navigation_admin',
      fallback: 'Admin',
      icon: 'i-lucide-shield-check',
      to: '/admin'
    })
  }

  return entries
}

export function buildAppNavigation(ctx: AppNavContext): AppNavSection[] {
  const sections: AppNavSection[] = [
    {
      id: 'primary',
      labelKey: 'navigation_section_primary',
      fallback: 'Main',
      items: PRIMARY_NAV_ENTRIES.map(cloneEntry)
    }
  ]

  if (ctx.isCoach) {
    sections.push({
      id: 'coaching',
      labelKey: 'navigation_coaching',
      fallback: 'Coaching',
      items: COACHING_SUITE_ENTRIES.map(cloneEntry)
    })
  }

  sections.push(
    {
      id: 'more',
      labelKey: 'navigation_more',
      fallback: 'More',
      items: buildMoreEntries(ctx)
    },
    {
      id: 'account',
      labelKey: 'navigation_section_account',
      fallback: 'Account',
      items: buildAccountEntries(ctx)
    }
  )

  return sections
}

/**
 * Shortcuts in the account (avatar) menu. The sidebar itself only carries a
 * single "Settings" entry; the individual settings pages live here and in the
 * command palette. Developer settings and the danger zone stay inside Settings.
 */
export function buildAccountMenuEntries(ctx: AppNavContext): AppNavEntry[] {
  const entries: AppNavEntry[] = [
    {
      id: 'account-profile',
      labelKey: 'navigation_settings_profile',
      fallback: 'Profile',
      icon: 'i-lucide-user',
      to: '/profile/settings'
    },
    {
      id: 'account-training-zones',
      labelKey: 'navigation_account_training_zones',
      fallback: 'Training zones & sports',
      icon: 'i-lucide-gauge',
      to: '/profile/settings?tab=sports'
    },
    {
      id: 'account-connected-apps',
      labelKey: 'navigation_settings_connected_apps',
      fallback: 'Connected apps',
      icon: 'i-lucide-plug',
      to: '/settings/apps'
    },
    {
      id: 'account-ai-coach',
      labelKey: 'navigation_settings_ai_coach',
      fallback: 'AI Coach',
      icon: 'i-lucide-sparkles',
      to: '/settings/ai'
    }
  ]

  return entries
}

/**
 * Destinations that are searchable from the command palette but deliberately
 * kept out of the sidebar (power-user pages, or coaching pages the current
 * user's role does not surface in the sidebar).
 */
export function buildPaletteOnlyEntries(ctx: AppNavContext): AppNavEntry[] {
  const entries: AppNavEntry[] = [
    {
      id: 'events',
      labelKey: 'navigation_events',
      fallback: 'Events',
      icon: 'i-lucide-flag',
      to: '/events'
    },
    {
      id: 'personal-bests',
      labelKey: 'navigation_personal_bests',
      fallback: 'Personal bests',
      icon: 'i-lucide-medal',
      to: '/performance/bests'
    },
    {
      id: 'recommendations',
      labelKey: 'navigation_recommendations',
      fallback: 'Recommendations',
      icon: 'i-lucide-sparkles',
      to: '/recommendations'
    },
    {
      id: 'charts',
      labelKey: 'navigation_charts',
      fallback: 'Charts',
      icon: 'i-lucide-chart-area',
      to: '/analytics/browse'
    }
  ]

  if (!ctx.isCoach) {
    if (ctx.hasOwnCoach) {
      entries.push({
        id: 'coaching',
        labelKey: 'navigation_coaching',
        fallback: 'Coaching',
        icon: 'i-lucide-users',
        to: '/coaching',
        exact: true
      })
    } else {
      entries.push({
        id: 'my-coaches',
        labelKey: 'navigation_my_coaches',
        fallback: 'My coaches',
        icon: 'i-lucide-building-2',
        to: '/coaching/team'
      })
    }
  }

  return entries
}

function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] || '/'
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery
}

/**
 * Length of the longest target of `entry` (its `to` or a `match` prefix) that
 * contains `path`, or -1 when the entry does not own the path. Children are not
 * considered.
 */
function matchLength(entry: AppNavEntry, path: string): number {
  let best = -1
  const targets = [
    ...(entry.to ? [{ target: entry.to, exact: !!entry.exact }] : []),
    ...(entry.match ?? []).map((target) => ({ target, exact: false }))
  ]

  for (const { target, exact } of targets) {
    const normalized = normalizePath(target)
    const hit = exact
      ? path === normalized
      : path === normalized || path.startsWith(`${normalized === '/' ? '' : normalized}/`)
    if (hit && normalized.length > best) best = normalized.length
  }

  return best
}

/** Depth-first list of every entry, parents before their children. */
export function flattenNavEntries(entries: readonly AppNavEntry[]): AppNavEntry[] {
  return entries.flatMap((entry) => [entry, ...flattenNavEntries(entry.children ?? [])])
}

export interface ActiveNavMatch {
  sectionId: AppNavSectionId
  entry: AppNavEntry
  /** Ids from the top-level entry down to (and including) the active entry. */
  trail: string[]
}

/**
 * Resolve the single destination that owns `path`. The most specific (longest)
 * target wins, so `/workouts/planned/…` highlights Calendar rather than
 * Workout history, and exactly one item is ever highlighted.
 */
export function findActiveNavEntry(
  sections: readonly AppNavSection[],
  path: string
): ActiveNavMatch | null {
  const current = normalizePath(path)
  let best: ActiveNavMatch | null = null
  let bestLength = -1

  const visit = (sectionId: AppNavSectionId, entries: readonly AppNavEntry[], trail: string[]) => {
    for (const entry of entries) {
      const nextTrail = [...trail, entry.id]
      const length = matchLength(entry, current)
      if (length > bestLength) {
        bestLength = length
        best = { sectionId, entry, trail: nextTrail }
      }
      if (entry.children?.length) visit(sectionId, entry.children, nextTrail)
    }
  }

  for (const section of sections) visit(section.id, section.items, [])

  return best
}
