import { useTranslate } from '@tolgee/vue'
import type {
  CommandPaletteItem,
  DropdownMenuItem,
  NavigationMenuChildItem,
  NavigationMenuItem
} from '@nuxt/ui'
import { useCoachingRole } from '~/components/navigation/useCoachingRole'
import {
  buildAccountMenuEntries,
  buildAppNavigation,
  buildPaletteOnlyEntries,
  findActiveNavEntry,
  type AppNavContext,
  type AppNavEntry,
  type AppNavSection,
  type AppNavSectionId
} from '~/utils/navigation'

export interface AppBottomTab {
  id: string
  label: string
  icon: string
  to: string
  active: boolean
  onSelect: () => void
}

export interface AppNavDrawerSection {
  id: AppNavSectionId
  label: string
  items: NavigationMenuItem[]
}

export interface UseAppNavigationOptions {
  /** Runs after any destination is selected — e.g. to close the mobile drawer. */
  onNavigate?: () => void
}

const SECTION_GROUP_ICONS: Partial<Record<AppNavSectionId, string>> = {
  coaching: 'i-lucide-users',
  more: 'i-lucide-ellipsis'
}

/**
 * Turns the navigation model from `~/utils/navigation` into the shapes each
 * surface needs (desktop sidebar, mobile drawer, bottom tab bar, command
 * palette, account menu), with translated labels, nav-click analytics and a
 * single highlighted destination.
 */
export function useAppNavigation(options: UseAppNavigationOptions = {}) {
  const { t } = useTranslate('common')
  const route = useRoute()
  const { data: authData } = useAuth()
  const userStore = useUserStore()
  const { trackNavClick } = useAnalytics()
  const { isCoachForAnyone, hasOwnCoach } = useCoachingRole()

  /** Translated label, or the English fallback when the key is missing / i18n is not ready. */
  function navLabel(key: string, fallback: string): string {
    const translate = t.value
    if (typeof translate !== 'function') return fallback
    const translated = translate(key)
    return !translated || translated === key ? fallback : translated
  }

  const context = computed<AppNavContext>(() => ({
    nutritionEnabled:
      userStore.profile?.nutritionTrackingEnabled !== false &&
      userStore.user?.nutritionTrackingEnabled !== false,
    billingEnabled: false,
    isAdmin: Boolean((authData.value?.user as { isAdmin?: boolean } | undefined)?.isAdmin),
    isCoach: isCoachForAnyone.value,
    hasOwnCoach: hasOwnCoach.value
  }))

  const sections = computed(() => buildAppNavigation(context.value))
  const activeMatch = computed(() => findActiveNavEntry(sections.value, route.path))
  const activeTrail = computed(() => new Set(activeMatch.value?.trail ?? []))

  function select(path: string, label: string) {
    trackNavClick(path, label)
    options.onNavigate?.()
  }

  function toMenuItem(entry: AppNavEntry): NavigationMenuItem {
    const label = navLabel(entry.labelKey, entry.fallback)

    if (entry.children?.length) {
      return {
        label,
        icon: entry.icon,
        value: entry.id,
        defaultOpen: activeTrail.value.has(entry.id),
        children: entry.children.map(toMenuItem)
      }
    }

    const to = entry.to ?? '/'
    return {
      label,
      icon: entry.icon,
      value: entry.id,
      to,
      // Highlighting is resolved here (longest match wins) instead of by the
      // router, so exactly one destination is ever marked active.
      active: activeMatch.value?.entry.id === entry.id,
      onSelect: () => select(to, label)
    }
  }

  function sectionLabel(section: AppNavSection) {
    return navLabel(section.labelKey, section.fallback)
  }

  function findSection(id: AppNavSectionId) {
    return sections.value.find((section) => section.id === id)
  }

  /** Desktop sidebar: primary destinations, then collapsible Coaching / More groups. */
  const sidebarItems = computed<NavigationMenuItem[][]>(() => {
    const primary = findSection('primary')?.items.map(toMenuItem) ?? []
    const groups = sections.value
      .filter((section) => SECTION_GROUP_ICONS[section.id])
      .map<NavigationMenuItem>((section) => ({
        label: sectionLabel(section),
        icon: SECTION_GROUP_ICONS[section.id],
        value: `section-${section.id}`,
        defaultOpen: activeMatch.value?.sectionId === section.id,
        children: section.items.map(toMenuItem)
      }))

    return [primary, groups]
  })

  /**
   * Icon-only sidebar: groups open as hover popovers that only render one level,
   * so nested children (Library) are inlined, and the group icon carries the
   * active state of whatever is inside it.
   */
  const sidebarCollapsedItems = computed<NavigationMenuItem[][]>(() =>
    sidebarItems.value.map((list) =>
      list.map((item) => {
        if (!item.children?.length) return item
        const sectionId = String(item.value).replace(/^section-/, '')
        return {
          ...item,
          active: activeMatch.value?.sectionId === sectionId,
          children: item.children.flatMap((child) =>
            child.children?.length
              ? child.children.map((grandchild: NavigationMenuChildItem) => ({
                  ...grandchild,
                  label: `${child.label} · ${grandchild.label}`
                }))
              : [child]
          )
        }
      })
    )
  )

  /** Settings / Help / Admin, pinned to the bottom of the sidebar. */
  const sidebarAccountItems = computed<NavigationMenuItem[]>(
    () => findSection('account')?.items.map(toMenuItem) ?? []
  )

  /** Mobile drawer ("More" tab): everything the bottom tab bar does not show. */
  const drawerSections = computed<AppNavDrawerSection[]>(() =>
    sections.value
      .filter((section) => section.id !== 'primary')
      .map((section) => ({
        id: section.id,
        label: sectionLabel(section),
        items: section.items.map(toMenuItem)
      }))
  )

  const bottomTabs = computed<AppBottomTab[]>(() =>
    (findSection('primary')?.items ?? []).map((entry) => {
      const label = navLabel(entry.labelKey, entry.fallback)
      const to = entry.to ?? '/'
      return {
        id: entry.id,
        label,
        icon: entry.icon,
        to,
        active: activeMatch.value?.entry.id === entry.id,
        onSelect: () => select(to, label)
      }
    })
  )

  /** The current page lives behind the "More" tab (or another non-primary section). */
  const isSecondaryActive = computed(
    () => !!activeMatch.value && activeMatch.value.sectionId !== 'primary'
  )

  /** Flat, searchable "Go to" list for the command palette. */
  const paletteLinks = computed<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = []

    const add = (entry: AppNavEntry, prefix?: string) => {
      const own = navLabel(entry.labelKey, entry.fallback)
      if (entry.children?.length) {
        entry.children.forEach((child) => add(child, prefix ? `${prefix}: ${own}` : own))
        return
      }
      const label = prefix ? `${prefix}: ${own}` : own
      const to = entry.to ?? '/'
      items.push({
        id: `nav-${entry.id}`,
        label,
        icon: entry.icon,
        to,
        onSelect: () => select(to, label)
      })
    }

    for (const section of sections.value) {
      const prefix = section.id === 'coaching' ? sectionLabel(section) : undefined
      section.items.forEach((entry) => add(entry, prefix))
    }
    buildPaletteOnlyEntries(context.value).forEach((entry) => add(entry))

    return items
  })

  /** Settings shortcuts for the account (avatar) menu. */
  const accountMenuLinks = computed<DropdownMenuItem[]>(() =>
    buildAccountMenuEntries(context.value).map((entry) => {
      const label = navLabel(entry.labelKey, entry.fallback)
      const to = entry.to ?? '/'
      return {
        label,
        icon: entry.icon,
        to,
        onSelect: () => select(to, label)
      }
    })
  )

  return {
    navLabel,
    sections,
    activeMatch,
    sidebarItems,
    sidebarCollapsedItems,
    sidebarAccountItems,
    drawerSections,
    bottomTabs,
    isSecondaryActive,
    paletteLinks,
    accountMenuLinks
  }
}
