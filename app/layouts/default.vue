<script setup lang="ts">
  import { useTranslate, useTolgee } from '@tolgee/vue'
  import { useAppLogout } from '#imports'

  const { t } = useTranslate('common')
  const tolgee = useTolgee()
  const isTReady = ref(false)

  // Robust ready check
  watch(
    () => t.value,
    (val) => {
      if (typeof val === 'function') {
        isTReady.value = true
      }
    },
    { immediate: true }
  )

  provide('isTReady', isTReady)

  const config = useRuntimeConfig()
  const { data, refresh } = useAuth()
  const { logout } = useAppLogout()
  const user = computed(() => data.value?.user)
  const toast = useToast()
  const stoppingImpersonation = ref(false)

  // Background Task Monitor State
  const { isOpen: showTriggerMonitor } = useTriggerMonitor()

  const buildVersionDisplay = computed(
    () =>
      (config.public.buildVersion as string) ||
      `v${config.public.version}+${config.public.buildDate}.${config.public.commitHash}.${config.public.buildCodename}`
  )

  const sidebarVersionDisplay = computed(() => {
    return `v${config.public.version}+${config.public.buildCodename}`
  })

  const userStore = useUserStore()
  const { formatDate, getUserLocalDate } = useFormat()
  const nutritionEnabled = computed(
    () =>
      userStore.profile?.nutritionTrackingEnabled !== false &&
      userStore.user?.nutritionTrackingEnabled !== false
  )

  // Mobile drawer / sidebar open state (also opened by the bottom bar's "More" tab).
  const open = ref(false)
  const closeSidebar = () => {
    open.value = false
  }

  // Single source of truth for every navigation surface: desktop sidebar,
  // mobile drawer, bottom tab bar, command palette "Go to" and the account
  // menu. Destinations are defined in app/utils/navigation.ts.
  const {
    navLabel,
    sidebarItems,
    sidebarCollapsedItems,
    sidebarAccountItems,
    drawerSections,
    bottomTabs,
    isSecondaryActive,
    paletteLinks,
    accountMenuLinks
  } = useAppNavigation({ onNavigate: closeSidebar })

  // Mobile bottom tab bar — signed-in users only. The html class reserves room
  // for it below the lg breakpoint (see the <style> block at the end).
  const showBottomNav = computed(() => !!user.value)
  useHead({ htmlAttrs: { class: { 'has-app-bottom-nav': showBottomNav } } })

  // Ensure user data (including subscription) is loaded
  await callOnce(async () => {
    if (data.value?.user) {
      await Promise.all([userStore.fetchUser(), userStore.fetchProfile()])
    }
  })

  onMounted(() => {
    if (!userStore.user) {
      userStore.fetchUser()
    }
    if (!userStore.profile) {
      userStore.fetchProfile()
    }
  })

  const impersonationMeta = useCookie<{
    adminId: string
    adminEmail: string
    impersonatedUserId: string
    impersonatedUserEmail: string
  }>('auth.impersonation_meta')

  const impersonatedEmail = computed(() => impersonationMeta.value?.impersonatedUserEmail)

  async function stopImpersonation() {
    stoppingImpersonation.value = true
    try {
      await ($fetch as any)('/api/admin/stop-impersonation', { method: 'POST' })
      toast.add({
        title: 'Impersonation stopped',
        description: 'Returning to admin account',
        color: 'success'
      })
      // Refresh session and redirect
      await refresh()
      await navigateTo('/admin/users')
    } catch (error) {
      console.error('Failed to stop impersonation:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to stop impersonation',
        color: 'error'
      })
    } finally {
      stoppingImpersonation.value = false
    }
  }

  const mobileSidebarNavRef = ref<{ refresh: () => void } | null>(null)

  watch(open, (isOpen) => {
    if (!isOpen) return
    nextTick(() => mobileSidebarNavRef.value?.refresh())
  })

  // Command Palette Groups
  const groups = computed(() => {
    const searchGroups: any[] = []

    // 1. Nutrition Group
    const localToday = getUserLocalDate()
    const formatDateKey = (d: Date) => d.toISOString().split('T')[0]

    const todayStr = formatDateKey(localToday)
    const yesterdayStr = formatDateKey(new Date(localToday.getTime() - 86400000))
    const tomorrowStr = formatDateKey(new Date(localToday.getTime() + 86400000))

    if (nutritionEnabled.value) {
      searchGroups.push({
        id: 'nutrition',
        label: navLabel('navigation_nutrition', 'Nutrition'),
        items: [
          {
            id: 'nutrition-today',
            label: navLabel('navigation_search_nutrition_today', 'Today'),
            icon: 'i-lucide-utensils',
            to: `/nutrition/${todayStr}`,
            onSelect: closeSidebar
          },
          {
            id: 'nutrition-tomorrow',
            label: navLabel('navigation_search_nutrition_tomorrow', 'Tomorrow'),
            icon: 'i-lucide-utensils',
            to: `/nutrition/${tomorrowStr}`,
            onSelect: closeSidebar
          },
          {
            id: 'nutrition-yesterday',
            label: navLabel('navigation_search_nutrition_yesterday', 'Yesterday'),
            icon: 'i-lucide-utensils',
            to: `/nutrition/${yesterdayStr}`,
            onSelect: closeSidebar
          }
        ]
      })
    }

    // 2. Upcoming Workouts (Filter out rest days)
    if (upcomingWorkouts.value?.workouts?.length) {
      const activeWorkouts = upcomingWorkouts.value.workouts
        .filter((w: any) => {
          const title = w.title?.toLowerCase() || ''
          return w.type !== 'REST' && !title.includes('rest day')
        })
        .slice(0, 3)

      if (activeWorkouts.length > 0) {
        searchGroups.push({
          id: 'upcoming-workouts',
          label: navLabel('navigation_search_upcoming_workouts', 'Upcoming Workouts'),
          items: activeWorkouts.map((w: any) => ({
            id: `planned-workout-${w.id}`,
            label: w.title,
            description: formatDate(w.date, 'PPPP'),
            icon: 'i-lucide-calendar-plus',
            to: `/workouts/planned/${w.id}`,
            onSelect: closeSidebar
          }))
        })
      }
    }

    // 3. Recent Workouts
    if (recentWorkouts.value?.length) {
      searchGroups.push({
        id: 'recent-workouts',
        label: navLabel('navigation_search_recent_workouts', 'Recent Workouts'),
        items: (recentWorkouts.value as any[]).map((w: any) => ({
          id: `recent-workout-${w.id}`,
          label: w.title,
          description: formatDate(w.date, 'PPPP'),
          icon: 'i-lucide-history',
          to: `/workouts/${w.id}`,
          onSelect: closeSidebar
        }))
      })
    }

    // 4. Morning Routine — quick actions on the Today page. Deliberately kept
    // out of the sidebar: they open dialogs on /dashboard, not destinations.
    searchGroups.push({
      id: 'morning-routine',
      label: navLabel('navigation_search_morning_routine', 'Morning Routine'),
      items: [
        {
          id: 'morning-checkin',
          label: navLabel('navigation_morning_checkin', 'Morning Check-in'),
          icon: 'i-lucide-sunrise',
          to: {
            path: '/dashboard',
            query: { focus: 'checkin' }
          },
          onSelect: closeSidebar
        },
        {
          id: 'todays-wellness',
          label: navLabel('navigation_todays_wellness', "Today's Wellness"),
          icon: 'i-lucide-heart-pulse',
          to: {
            path: '/dashboard',
            query: { focus: 'wellness' }
          },
          onSelect: closeSidebar
        }
      ]
    })

    // 5. Navigation Group — every app destination (from the nav model)
    searchGroups.push({
      id: 'links',
      label: navLabel('navigation_search_go_to', 'Go to'),
      items: paletteLinks.value
    })

    // 6. Settings Group (Deep Links)
    const settingsItems = [
      {
        label: navLabel('navigation_settings_profile_basic', 'Profile: Basic Settings'),
        icon: 'i-heroicons-user-circle',
        to: '/profile/settings?tab=basic',
        onSelect: closeSidebar
      },
      {
        label: navLabel('navigation_settings_profile_sport', 'Profile: Sport Settings'),
        icon: 'i-heroicons-trophy',
        to: '/profile/settings?tab=sports',
        onSelect: closeSidebar
      },
      {
        label: navLabel('navigation_settings_profile_availability', 'Profile: Availability'),
        icon: 'i-lucide-calendar-clock',
        to: '/profile/settings?tab=availability',
        onSelect: closeSidebar
      },
      ...(nutritionEnabled.value
        ? [
            {
              label: navLabel('navigation_settings_profile_nutrition', 'Profile: Nutrition'),
              icon: 'i-heroicons-fire',
              to: '/profile/settings?tab=nutrition',
              onSelect: closeSidebar
            }
          ]
        : []),
      {
        label: navLabel('navigation_settings_athlete_profile', 'Athlete Profile'),
        icon: 'i-lucide-user-2',
        to: '/profile/athlete',
        onSelect: closeSidebar
      },
      ...(nutritionEnabled.value
        ? [
            {
              label: navLabel('navigation_search_nutrition_history', 'Nutrition: History'),
              icon: 'i-lucide-history',
              to: '/nutrition/history',
              onSelect: closeSidebar
            }
          ]
        : []),
      {
        label: navLabel('navigation_settings_ai_coach_settings', 'AI Coach Settings'),
        icon: 'i-lucide-sparkles',
        to: '/settings/ai',
        onSelect: closeSidebar
      },
      {
        label: navLabel(
          'navigation_settings_apps_connected',
          'Connected Apps (Strava, Garmin, Oura...)'
        ),
        icon: 'i-lucide-layout-grid',
        to: '/settings/apps',
        onSelect: closeSidebar
      },
      {
        label: navLabel('navigation_settings_developer_settings', 'Developer Settings'),
        icon: 'i-lucide-code-2',
        to: '/settings/developer',
        onSelect: closeSidebar
      },
      {
        label: navLabel('navigation_settings_danger_zone', 'Danger Zone'),
        icon: 'i-lucide-trash-2',
        to: '/settings/danger',
        onSelect: closeSidebar
      },
      {
        label: navLabel('navigation_settings_release_notes', 'Release Notes'),
        icon: 'i-lucide-clipboard-list',
        to: '/settings/release-notes',
        onSelect: closeSidebar
      },
      {
        label: navLabel('navigation_settings_changelog', 'Changelog'),
        icon: 'i-lucide-history',
        to: '/settings/changelog',
        onSelect: closeSidebar
      },
      {
        label: navLabel('navigation_settings_privacy_policy', 'Privacy Policy'),
        icon: 'i-lucide-shield',
        to: '/privacy',
        onSelect: closeSidebar
      }
    ]

    if (config.public.stripePublishableKey) {
      settingsItems.push({
        label: navLabel('navigation_settings_billing', 'Billing'),
        icon: 'i-lucide-credit-card',
        to: '/settings/billing',
        onSelect: closeSidebar
      })
    }

    searchGroups.push({
      id: 'settings',
      label: navLabel('navigation_settings_title', 'Settings'),
      items: settingsItems
    })

    // 7. Admin Group (Only for Admins)
    if ((user.value as any)?.isAdmin) {
      const adminLabel = navLabel('navigation_admin', 'Admin')

      searchGroups.push({
        id: 'admin',
        label: adminLabel,
        items: [
          {
            label: navLabel('navigation_admin_nav_users', 'Users Management'),
            icon: 'i-lucide-users-2',
            to: '/admin/users',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_subscriptions', 'Subscriptions'),
            icon: 'i-lucide-wallet',
            to: '/admin/subscriptions',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_system_messages', 'System Messages'),
            icon: 'i-lucide-megaphone',
            to: '/admin/system-messages',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_tickets', 'Tickets'),
            icon: 'i-lucide-bug',
            to: '/admin/issues',
            onSelect: closeSidebar
          }
        ]
      })

      searchGroups.push({
        id: 'admin-stats',
        label: `${adminLabel}: ${navLabel('navigation_admin_nav_statistics', 'Statistics')}`,
        items: [
          {
            label: navLabel('navigation_admin_nav_llm_overview', 'Overview Stats'),
            icon: 'i-lucide-bar-chart-3',
            to: '/admin/stats',
            onSelect: closeSidebar
          },
          {
            label: navLabel(
              'navigation_admin_nav_stats_llm_performance',
              'LLM Performance & Costs'
            ),
            icon: 'i-lucide-brain-circuit',
            to: '/admin/stats/llm',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_stats_user_analytics', 'User Analytics'),
            icon: 'i-lucide-trending-up',
            to: '/admin/stats/users',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_stats_developers', 'Developer & API Stats'),
            icon: 'i-lucide-code-2',
            to: '/admin/stats/developers',
            onSelect: closeSidebar
          },
          {
            label: navLabel(
              'navigation_admin_nav_stats_webhook_performance',
              'Webhook Performance'
            ),
            icon: 'i-lucide-webhook',
            to: '/admin/stats/webhooks',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_stats_workout_sync', 'Workout & Sync Stats'),
            icon: 'i-lucide-activity',
            to: '/admin/stats/workouts',
            onSelect: closeSidebar
          }
        ]
      })

      searchGroups.push({
        id: 'admin-monitoring',
        label: `${adminLabel}: ${navLabel('navigation_admin_nav_monitoring_title', 'Monitoring')}`,
        items: [
          {
            label: navLabel('navigation_admin_nav_monitoring_ai_logs_live', 'AI Logs (Live)'),
            icon: 'i-lucide-terminal',
            to: '/admin/ai/logs',
            onSelect: closeSidebar
          },
          {
            label: navLabel(
              'navigation_admin_nav_monitoring_audit_security_logs',
              'Audit & Security Logs'
            ),
            icon: 'i-lucide-scroll-text',
            to: '/admin/audit-logs',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_monitoring_failed_requests', 'Failed Requests'),
            icon: 'i-lucide-alert-triangle',
            to: '/admin/ai/failed-requests',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_monitoring_trigger_queues', 'Trigger.dev Queues'),
            icon: 'i-lucide-layers',
            to: '/admin/queues',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_monitoring_native_webhooks', 'Native Webhooks'),
            icon: 'i-lucide-webhook',
            to: '/admin/webhooks',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_llm_global_settings', 'Global LLM Settings'),
            icon: 'i-lucide-settings-2',
            to: '/admin/llm/settings',
            onSelect: closeSidebar
          }
        ]
      })

      searchGroups.push({
        id: 'admin-debug',
        label: `${adminLabel}: ${navLabel('navigation_admin_nav_debug_title', 'Debug Tools')}`,
        items: [
          {
            label: navLabel('navigation_admin_nav_debug_trigger_config', 'Trigger.dev Config'),
            icon: 'i-lucide-zap',
            to: '/admin/debug/trigger',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_debug_env_vars_config', 'Env Vars & Config'),
            icon: 'i-lucide-file-code',
            to: '/admin/debug/env',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_debug_database_explorer', 'Database Explorer'),
            icon: 'i-lucide-database',
            to: '/admin/debug/database',
            onSelect: closeSidebar
          },
          {
            label: navLabel('navigation_admin_nav_debug_ping', 'Network Ping Tool'),
            icon: 'i-lucide-radio',
            to: '/admin/debug/ping',
            onSelect: closeSidebar
          }
        ]
      })
    }

    return searchGroups
  })

  // Smart Item Data Fetching
  const { data: recentWorkouts } = await useFetch<any, Error, string & {}>('/api/workouts', {
    query: { limit: 3 },
    key: 'recent-workouts-search'
  })

  const { data: upcomingWorkouts } = await useFetch<any, Error, string & {}>(
    '/api/workouts/planned/upcoming',
    {
      key: 'upcoming-workouts-search'
    }
  )
</script>

<template>
  <UDashboardGroup
    unit="rem"
    class="app-shell print:static print:inset-auto print:block print:overflow-visible"
  >
    <UDashboardSidebar
      id="default"
      :key="tolgee.getLanguage()"
      v-model:open="open"
      collapsible
      resizable
      class="bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 print:hidden"
      :ui="{ footer: 'lg:border-t lg:border-default', body: 'flex min-h-0 flex-col' }"
      :title="navLabel('navigation_sidebar_title', 'Navigation')"
      :description="navLabel('navigation_sidebar_description', 'Browse Coach Watts destinations')"
      :menu="{
        title: navLabel('navigation_sidebar_title', 'Navigation'),
        description: navLabel('navigation_sidebar_description', 'Browse Coach Watts destinations')
      }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/dashboard"
          class="flex items-center w-full overflow-hidden shrink-0"
          :class="collapsed ? 'p-1 justify-center' : 'p-4 justify-start lg:justify-center'"
        >
          <img
            v-if="!collapsed"
            src="/media/coach_watts_text_cropped.webp"
            alt="Coach Watts"
            width="702"
            height="135"
            loading="eager"
            decoding="async"
            class="h-8 lg:h-10 w-auto object-contain"
          />
          <img
            v-else
            src="/media/logo.webp"
            alt="Coach Watts"
            width="537"
            height="537"
            loading="eager"
            decoding="async"
            class="size-12 object-contain"
          />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          :collapsed="collapsed"
          :aria-label="navLabel('navigation_search_title', 'Search')"
          class="mb-4 shrink-0 bg-transparent ring-default"
        />

        <!-- Desktop: Today / Calendar / Progress / Coach, then collapsible
             Coaching + More groups, with Settings / Help / Admin pinned below. -->
        <div class="hidden min-h-0 flex-1 flex-col gap-4 lg:flex">
          <UNavigationMenu
            :collapsed="collapsed"
            :items="collapsed ? sidebarCollapsedItems : sidebarItems"
            orientation="vertical"
            tooltip
            popover
            data-testid="sidebar-nav"
          />
          <UNavigationMenu
            :collapsed="collapsed"
            :items="sidebarAccountItems"
            orientation="vertical"
            tooltip
            class="mt-auto"
            data-testid="sidebar-account-nav"
          />
        </div>

        <!-- Mobile drawer ("More" tab): the primary destinations live in the bottom bar. -->
        <LayoutMobileSidebarNav ref="mobileSidebarNavRef" :sections="drawerSections" />
      </template>

      <template #footer="{ collapsed }">
        <LayoutMobileSidebarFooter
          :user="user"
          :impersonated-email="impersonatedEmail"
          :stopping-impersonation="stoppingImpersonation"
          :sidebar-version-display="sidebarVersionDisplay"
          :settings-items="accountMenuLinks"
          @logout="
            () => {
              void logout('/login')
            }
          "
          @stop-impersonation="
            () => {
              void stopImpersonation()
            }
          "
        />

        <div class="hidden w-full flex-col gap-2 py-1 lg:flex">
          <div v-if="!collapsed" class="flex items-center justify-center gap-4">
            <NuxtLink
              to="https://www.strava.com/clubs/2004142"
              target="_blank"
              class="hover:opacity-100 transition-opacity"
            >
              <img
                src="/images/logos/strava_powered_by_black.png"
                alt="Powered by Strava"
                width="176"
                height="60"
                loading="lazy"
                decoding="async"
                class="h-6 w-auto opacity-75 hover:opacity-100 dark:hidden"
              />
              <img
                src="/images/logos/strava_powered_by.png"
                alt="Powered by Strava"
                width="176"
                height="60"
                loading="lazy"
                decoding="async"
                class="h-6 w-auto opacity-75 hover:opacity-100 hidden dark:block"
              />
            </NuxtLink>
            <NuxtLink
              to="https://www.garmin.com"
              target="_blank"
              class="hover:opacity-100 transition-opacity"
            >
              <img
                src="/images/logos/WorksWithGarmin-Black.svg"
                alt="Works with Garmin"
                width="221"
                height="127"
                loading="lazy"
                decoding="async"
                class="h-6 w-auto opacity-75 hover:opacity-100 dark:hidden"
              />
              <img
                src="/images/logos/WorksWithGarmin-White.svg"
                alt="Works with Garmin"
                width="221"
                height="127"
                loading="lazy"
                decoding="async"
                class="h-6 w-auto opacity-75 hover:opacity-100 hidden dark:block"
              />
            </NuxtLink>
          </div>

          <div class="flex w-full items-center gap-1" :class="{ 'justify-center': collapsed }">
            <LayoutAccountMenu
              :user="user"
              :impersonated-email="impersonatedEmail"
              :subtitle="sidebarVersionDisplay"
              :settings-items="accountMenuLinks"
              :collapsed="collapsed"
              @logout="
                () => {
                  void logout('/login')
                }
              "
              @stop-impersonation="
                () => {
                  void stopImpersonation()
                }
              "
            />
            <ColorModeButton v-if="!collapsed" />
          </div>

          <div v-if="collapsed" class="flex justify-center">
            <UTooltip :text="buildVersionDisplay" :content="{ side: 'right' }">
              <span class="text-[10px] text-gray-400 dark:text-gray-400 font-mono cursor-default">
                {{ config.public.version }}
              </span>
            </UTooltip>
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardSearch
      :key="tolgee.getLanguage()"
      :groups="groups"
      :title="navLabel('navigation_search_title', 'Search')"
      :description="
        navLabel('navigation_search_description', 'Search pages, workouts, and shortcuts')
      "
    />

    <slot />

    <LayoutMobileBottomNav
      v-if="showBottomNav"
      :tabs="bottomTabs"
      :more-label="navLabel('navigation_more', 'More')"
      :more-active="isSecondaryActive"
      :more-open="open"
      :label="navLabel('navigation_bottom_nav_label', 'Main navigation')"
      @more="open = true"
    />

    <ClientOnly>
      <AiQuickCapture />
      <DashboardTriggerMonitor v-model="showTriggerMonitor" />
      <!-- ImpersonationBanner and CoachingBanner are mounted once in app/app.vue (CW-541) -->
    </ClientOnly>
  </UDashboardGroup>
</template>

<style>
  /*
   * Mobile bottom tab bar (LayoutMobileBottomNav, h-16 + safe-area inset).
   * Below the lg breakpoint the dashboard shell ends above the bar, so every
   * page's scroll area and bottom-anchored UI (chat input, sticky footers)
   * stays visible. Fixed-position elements (e.g. AiQuickCapture) can offset
   * themselves with `var(--app-bottom-nav-offset, 0px)`.
   */
  :root {
    --app-bottom-nav-height: 4rem;
  }

  @media screen and (max-width: 63.999rem) {
    :root.has-app-bottom-nav {
      --app-bottom-nav-offset: calc(
        var(--app-bottom-nav-height) + env(safe-area-inset-bottom, 0px)
      );
    }

    .has-app-bottom-nav .app-shell {
      bottom: var(--app-bottom-nav-offset);
    }

    /* Panels default to min-h-svh; cap them to the shortened shell instead. */
    .has-app-bottom-nav .app-shell > [id^='dashboard-panel-'] {
      min-height: 0;
      max-height: 100%;
    }
  }
</style>
