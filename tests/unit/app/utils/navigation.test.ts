import { describe, it, expect } from 'vitest'
import {
  buildAccountMenuEntries,
  buildAppNavigation,
  buildPaletteOnlyEntries,
  findActiveNavEntry,
  flattenNavEntries,
  type AppNavContext,
  type AppNavSectionId
} from '~/utils/navigation'

const selfCoachedAthlete: AppNavContext = {
  nutritionEnabled: true,
  billingEnabled: true,
  isAdmin: false,
  isCoach: false,
  hasOwnCoach: false
}

function ctx(overrides: Partial<AppNavContext> = {}): AppNavContext {
  return { ...selfCoachedAthlete, ...overrides }
}

function sectionIds(context: AppNavContext): AppNavSectionId[] {
  return buildAppNavigation(context).map((section) => section.id)
}

function itemIds(context: AppNavContext, sectionId: AppNavSectionId): string[] {
  return (
    buildAppNavigation(context)
      .find((section) => section.id === sectionId)
      ?.items.map((item) => item.id) ?? []
  )
}

function allEntries(context: AppNavContext) {
  return flattenNavEntries(buildAppNavigation(context).flatMap((section) => section.items))
}

describe('buildAppNavigation', () => {
  it('leads with the four athlete destinations', () => {
    const primary = buildAppNavigation(ctx()).find((section) => section.id === 'primary')!

    expect(primary.items.map((item) => [item.id, item.fallback, item.to])).toEqual([
      ['today', 'Today', '/dashboard'],
      ['calendar', 'Calendar', '/activities'],
      ['progress', 'Progress', '/performance'],
      ['coach', 'Coach', '/chat']
    ])
  })

  it('puts secondary destinations behind More', () => {
    expect(itemIds(ctx(), 'more')).toEqual([
      'training-plan',
      'workout-history',
      'goals',
      'injuries',
      'recovery-fitness',
      'nutrition',
      'reports',
      'library',
      'coaching'
    ])

    const library = buildAppNavigation(ctx())
      .find((section) => section.id === 'more')!
      .items.find((item) => item.id === 'library')!
    expect(library.children?.map((child) => child.to)).toEqual([
      '/library/workouts',
      '/library/plans',
      '/library/exercises'
    ])
  })

  it('hides nutrition when tracking is disabled', () => {
    expect(itemIds(ctx({ nutritionEnabled: false }), 'more')).not.toContain('nutrition')
  })

  it('no longer links dashboard dialogs (check-in / wellness) as destinations', () => {
    const entries = allEntries(ctx({ isAdmin: true, isCoach: true }))
    expect(entries.some((entry) => entry.to?.includes('focus='))).toBe(false)
    expect(entries.filter((entry) => entry.to === '/dashboard')).toHaveLength(1)
  })

  it('keeps settings to a single sidebar entry', () => {
    expect(itemIds(ctx(), 'account')).toEqual(['settings', 'help-center'])
    expect(itemIds(ctx({ isAdmin: true }), 'account')).toEqual(['settings', 'help-center', 'admin'])

    const settingsRoutes = allEntries(ctx({ isAdmin: true })).filter((entry) =>
      entry.to?.startsWith('/settings')
    )
    expect(settingsRoutes.map((entry) => entry.to)).toEqual(['/settings'])
  })

  describe('coaching', () => {
    it('shows the full suite in its own section only to people who coach', () => {
      const coach = ctx({ isCoach: true, hasOwnCoach: true })
      expect(sectionIds(coach)).toEqual(['primary', 'coaching', 'more', 'account'])
      expect(itemIds(coach, 'coaching')).toEqual([
        'coaching-overview',
        'coaching-calendar',
        'coaching-athletes',
        'coaching-analytics',
        'coaching-team'
      ])
      const more = itemIds(coach, 'more')
      expect(more).not.toContain('coaching')
      expect(more).not.toContain('my-coaches')
    })

    it('gives an athlete with a coach a "My coaches" entry in More', () => {
      const athlete = ctx({ hasOwnCoach: true })
      expect(sectionIds(athlete)).toEqual(['primary', 'more', 'account'])
      expect(itemIds(athlete, 'more')).toContain('my-coaches')
      expect(itemIds(athlete, 'more')).not.toContain('coaching')
    })

    it('gives a self-coached athlete a single low-key Coaching entry, not the suite', () => {
      expect(sectionIds(ctx())).toEqual(['primary', 'more', 'account'])
      expect(itemIds(ctx(), 'more')).toContain('coaching')
      expect(itemIds(ctx(), 'more')).not.toContain('my-coaches')
    })

    it('keeps the coaching page the sidebar hides searchable from the palette', () => {
      const paletteFor = (context: AppNavContext) =>
        buildPaletteOnlyEntries(context).map((entry) => entry.id)

      expect(paletteFor(ctx())).toContain('my-coaches')
      expect(paletteFor(ctx({ hasOwnCoach: true }))).toContain('coaching')
      expect(paletteFor(ctx({ isCoach: true }))).not.toContain('coaching')
      expect(paletteFor(ctx({ isCoach: true }))).not.toContain('my-coaches')
    })
  })

  it('uses unique ids and gives every leaf a route', () => {
    for (const context of [
      ctx(),
      ctx({ isCoach: true, isAdmin: true }),
      ctx({ hasOwnCoach: true })
    ]) {
      const entries = [
        ...allEntries(context),
        ...buildPaletteOnlyEntries(context),
        ...buildAccountMenuEntries(context)
      ]
      const ids = entries.map((entry) => entry.id)
      expect(new Set(ids).size).toBe(ids.length)

      for (const entry of entries) {
        if (entry.children?.length) expect(entry.to).toBeUndefined()
        else expect(entry.to).toMatch(/^\//)
      }
    }
  })

  it('returns fresh objects so callers cannot mutate the shared definitions', () => {
    const first = buildAppNavigation(ctx())
    first[0]!.items[0]!.fallback = 'Mutated'
    first[0]!.items[0]!.match?.push('/nope')

    expect(buildAppNavigation(ctx())[0]!.items[0]!.fallback).toBe('Today')
  })
})

describe('buildAccountMenuEntries', () => {
  it('offers profile, zones, connected apps and AI coach — without billing', () => {
    expect(buildAccountMenuEntries(ctx()).map((entry) => entry.to)).toEqual([
      '/profile/settings',
      '/profile/settings?tab=sports',
      '/settings/apps',
      '/settings/ai'
    ])
    expect(
      buildAccountMenuEntries(ctx({ billingEnabled: false })).map((entry) => entry.id)
    ).not.toContain('account-billing')
  })
})

describe('findActiveNavEntry', () => {
  const sections = buildAppNavigation(ctx({ isCoach: true, isAdmin: true }))
  const active = (path: string) => findActiveNavEntry(sections, path)?.entry.id ?? null

  it.each([
    ['/dashboard', 'today'],
    ['/dashboard/', 'today'],
    ['/activities', 'calendar'],
    ['/workouts/planned/abc', 'calendar'],
    ['/workouts/abc', 'workout-history'],
    ['/workouts', 'workout-history'],
    ['/performance/bests', 'progress'],
    ['/chat', 'coach'],
    ['/plan', 'training-plan'],
    ['/profile/goals', 'goals'],
    ['/events/42', 'goals'],
    ['/injuries', 'injuries'],
    ['/recovery', 'recovery-fitness'],
    ['/fitness/2026-10-01', 'recovery-fitness'],
    ['/report/1', 'reports'],
    ['/library/plans/1/architect', 'library-plans'],
    ['/coaching', 'coaching-overview'],
    ['/coaching/athletes/7', 'coaching-athletes'],
    ['/coaching/teams/3', 'coaching-team'],
    ['/analytics', 'coaching-analytics'],
    ['/settings/ai', 'settings'],
    ['/profile/settings', 'settings'],
    ['/admin/users', 'admin'],
    ['/analytics/browse', null],
    ['/planner', null],
    ['/unknown', null]
  ])('%s → %s', (path, expected) => {
    expect(active(path)).toBe(expected)
  })

  it('reports the section and the trail through nested groups', () => {
    expect(findActiveNavEntry(sections, '/library/exercises')).toMatchObject({
      sectionId: 'more',
      trail: ['library', 'library-exercises']
    })
    expect(findActiveNavEntry(sections, '/coaching/calendar')?.sectionId).toBe('coaching')
    expect(findActiveNavEntry(sections, '/dashboard')?.sectionId).toBe('primary')
  })

  it('only matches the overview of an exact entry on its own path', () => {
    const athleteSections = buildAppNavigation(ctx())
    expect(findActiveNavEntry(athleteSections, '/coaching')?.entry.id).toBe('coaching')
    expect(findActiveNavEntry(athleteSections, '/coaching/team')).toBeNull()
  })
})
