<script setup lang="ts">
  import { useTranslate, useTolgee } from '@tolgee/vue'
  import type { NavigationMenuItem } from '@nuxt/ui'
  import { useAppLogout } from '#imports'
  import {
    athletePrimaryNavigation,
    getAthleteArea,
    getAthleteContextNavigation
  } from '#shared/athlete-navigation'
  import { useCoachingRole } from '~/components/navigation/useCoachingRole'

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
  const colorMode = useColorMode()
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
  const { formatDate } = useFormat()
  const nutritionEnabled = computed(
    () =>
      userStore.profile?.nutritionTrackingEnabled !== false &&
      userStore.user?.nutritionTrackingEnabled !== false
  )

  const { trackNavClick } = useAnalytics()

  // CW-103: role-aware Coaching nav — pure athletes (connected to a coach but
  // never coaching anyone themselves) see a simplified "My Coaches" entry
  // instead of the full coach roster/teams suite.
  const { isCoachForAnyone: showFullCoachingSuite } = useCoachingRole()

  function wrapNavItems(items: NavigationMenuItem[]): NavigationMenuItem[] {
    return items.map((item) => {
      const path =
        typeof item.to === 'string'
          ? item.to
          : item.to && typeof item.to === 'object' && 'path' in item.to
            ? String(item.to.path)
            : '/'
      const label = String(item.label || path)
      const originalOnSelect = item.onSelect

      return {
        ...item,
        onSelect: (event: Event) => {
          trackNavClick(path, label)
          originalOnSelect?.(event)
        },
        children: item.children ? wrapNavItems(item.children) : undefined
      }
    })
  }

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

  const route = useRoute()

  const open = ref(false)

  function navLabel(key: string, fallback: string) {
    if (typeof t.value !== 'function') return fallback
    const translated = t.value(key)
    return !translated || translated === key ? fallback : translated
  }

  const searchInputProps = computed(() => ({
    placeholder: navLabel('navigation_search_title', 'Search'),
    'aria-label': navLabel('navigation_search_title', 'Search')
  }))

  // Navigation Items
  const links = computed<NavigationMenuItem[][]>(() => {
    // Force re-evaluation on language change or ready state
    const ready = isTReady.value && typeof t.value === 'function'
    const lang = tolgee.value.getLanguage()

    const primaryLinks: any[] = [
      {
        label: navLabel('navigation_dashboard', 'Dashboard'),
        icon: 'i-lucide-layout-dashboard',
        to: '/dashboard',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_morning_checkin', 'Morning Check-in'),
        icon: 'i-lucide-sunrise',
        to: {
          path: '/dashboard',
          query: { focus: 'checkin' }
        },
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_todays_wellness', "Today's Wellness"),
        icon: 'i-lucide-heart-pulse',
        to: {
          path: '/dashboard',
          query: { focus: 'wellness' }
        },
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_activities', 'Activities'),
        icon: 'i-lucide-calendar-days',
        to: '/activities',
        onSelect: () => {
          open.value = false
        }
      },
      ...(nutritionEnabled.value
        ? [
            {
              label: navLabel('navigation_nutrition', 'Nutrition'),
              icon: 'i-lucide-utensils',
              to: '/nutrition',
              onSelect: () => {
                open.value = false
              }
            }
          ]
        : []),
      {
        label: navLabel('navigation_performance', 'Performance'),
        icon: 'i-lucide-trending-up',
        to: '/performance',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_recommendations', 'Recommendations'),
        icon: 'i-lucide-sparkles',
        to: '/recommendations',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_training_plan', 'Training Plan'),
        icon: 'i-lucide-calendar',
        to: '/plan',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_workouts', 'Workouts'),
        icon: 'i-lucide-activity',
        to: '/workouts',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_fitness', 'Fitness'),
        icon: 'i-lucide-heart-pulse',
        to: '/fitness',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_injuries', 'Injuries & pain'),
        icon: 'i-lucide-bandage',
        to: '/injuries',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_personal_bests', 'Personal bests'),
        icon: 'i-lucide-medal',
        to: '/performance/bests',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_goals', 'Goals'),
        icon: 'i-lucide-trophy',
        to: '/profile/goals',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_events', 'Events'),
        icon: 'i-lucide-flag',
        to: '/events',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_reports', 'Reports'),
        icon: 'i-lucide-file-text',
        to: '/reports',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: navLabel('navigation_chat', 'AI Chat'),
        icon: 'i-lucide-message-circle',
        to: '/chat',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Library',
        icon: 'i-lucide-library',
        defaultOpen: route.path.includes('library') || route.path.includes('analytics/browse'),
        children: [
          {
            label: 'Workouts',
            icon: 'i-lucide-activity',
            to: '/library/workouts',
            onSelect: () => {
              open.value = false
            }
          },
          {
            label: 'Exercises',
            icon: 'i-lucide-dumbbell',
            to: '/library/exercises',
            onSelect: () => {
              open.value = false
            }
          },
          {
            label: 'Plans',
            icon: 'i-lucide-scroll-text',
            to: '/library/plans',
            onSelect: () => {
              open.value = false
            }
          },
          {
            label: 'Charts',
            icon: 'i-lucide-area-chart',
            to: '/analytics/browse',
            onSelect: () => {
              open.value = false
            }
          }
        ]
      },
      ...(showFullCoachingSuite.value
        ? [
            {
              label: 'Coaching',
              icon: 'i-lucide-users',
              defaultOpen: route.path.startsWith('/coaching'),
              children: [
                {
                  label: 'Overview',
                  icon: 'i-lucide-layout-dashboard',
                  to: '/coaching',
                  exact: true,
                  onSelect: () => {
                    open.value = false
                  }
                },
                {
                  label: 'Calendar',
                  icon: 'i-lucide-calendar-days',
                  to: '/coaching/calendar',
                  onSelect: () => {
                    open.value = false
                  }
                },
                {
                  label: 'Athletes',
                  icon: 'i-lucide-users-round',
                  to: '/coaching/athletes',
                  onSelect: () => {
                    open.value = false
                  }
                },
                {
                  label: 'Analytics',
                  icon: 'i-lucide-bar-chart-3',
                  to: '/analytics',
                  onSelect: () => {
                    open.value = false
                  }
                },
                {
                  label: 'My Coaches',
                  icon: 'i-lucide-building-2',
                  to: '/coaching/team',
                  onSelect: () => {
                    open.value = false
                  }
                }
              ]
            }
          ]
        : [
            {
              label: 'My Coaches',
              icon: 'i-lucide-users',
              to: '/coaching/team',
              onSelect: () => {
                open.value = false
              }
            }
          ]),
      {
        label: navLabel('navigation_help_center', 'Help Center'),
        icon: 'i-heroicons-question-mark-circle',
        to: '/help-center',
        onSelect: () => {
          open.value = false
        }
      }
    ]

    if ((user.value as any)?.isAdmin) {
      primaryLinks.push({
        label: navLabel('navigation_admin', 'Admin'),
        icon: 'i-lucide-shield-check',
        to: '/admin',
        onSelect: () => {
          open.value = false
        }
      })
    }

    primaryLinks.push({
      label: navLabel('navigation_settings_title', 'Settings'),
      icon: 'i-lucide-settings',
      defaultOpen: route.path.includes('settings'),
      children: [
        {
          label: navLabel('navigation_settings_profile', 'Profile'),
          icon: 'i-lucide-user',
          to: '/profile/settings',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: navLabel('navigation_settings_ai_coach', 'AI Coach'),
          icon: 'i-lucide-sparkles',
          to: '/settings/ai',
          onSelect: () => {
            open.value = false
          }
        },
        ...(config.public.stripePublishableKey
          ? [
              {
                label: navLabel('navigation_settings_billing', 'Billing'),
                icon: 'i-lucide-credit-card',
                to: '/settings/billing',
                onSelect: () => {
                  open.value = false
                }
              }
            ]
          : []),
        {
          label: navLabel('navigation_settings_apps', 'Apps'),
          icon: 'i-lucide-layout-grid',
          to: '/settings/apps',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: navLabel('navigation_settings_developer', 'Developer'),
          icon: 'i-lucide-code-2',
          to: '/settings/developer',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: navLabel('navigation_settings_danger_zone', 'Danger Zone'),
          icon: 'i-lucide-trash-2',
          to: '/settings/danger',
          onSelect: () => {
            open.value = false
          }
        }
      ]
    })

    return [wrapNavItems(primaryLinks)]
  })

  // Command Palette Groups
  const groups = computed(() => {
    const ready = isTReady.value && typeof t.value === 'function'
    const lang = tolgee.value.getLanguage()
    const searchGroups: any[] = []

    // 1. Nutrition Group
    const { getUserLocalDate } = useFormat()
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
            onSelect: () => (open.value = false)
          },
          {
            id: 'nutrition-tomorrow',
            label: navLabel('navigation_search_nutrition_tomorrow', 'Tomorrow'),
            icon: 'i-lucide-utensils',
            to: `/nutrition/${tomorrowStr}`,
            onSelect: () => (open.value = false)
          },
          {
            id: 'nutrition-yesterday',
            label: navLabel('navigation_search_nutrition_yesterday', 'Yesterday'),
            icon: 'i-lucide-utensils',
            to: `/nutrition/${yesterdayStr}`,
            onSelect: () => (open.value = false)
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
            onSelect: () => (open.value = false)
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
          onSelect: () => (open.value = false)
        }))
      })
    }

    // 4. Morning Routine Group
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
          onSelect: () => (open.value = false)
        },
        {
          id: 'todays-wellness',
          label: navLabel('navigation_todays_wellness', "Today's Wellness"),
          icon: 'i-lucide-heart-pulse',
          to: {
            path: '/dashboard',
            query: { focus: 'wellness' }
          },
          onSelect: () => (open.value = false)
        }
      ]
    })

    // 5. Navigation Group
    searchGroups.push({
      id: 'links',
      label: navLabel('navigation_search_go_to', 'Go to'),
      items: links.value.flat()
    })

    // 6. Settings Group (Deep Links)
    const settingsItems = [
      {
        label: navLabel('navigation_settings_profile_basic', 'Profile: Basic Settings'),
        icon: 'i-heroicons-user-circle',
        to: '/profile/settings?tab=basic',
        onSelect: () => (open.value = false)
      },
      {
        label: navLabel('navigation_settings_profile_sport', 'Profile: Sport Settings'),
        icon: 'i-heroicons-trophy',
        to: '/profile/settings?tab=sports',
        onSelect: () => (open.value = false)
      },
      {
        label: ready
          ? t.value('navigation_settings_profile_availability')
          : 'Profile: Availability',
        icon: 'i-lucide-calendar-clock',
        to: '/profile/settings?tab=availability',
        onSelect: () => (open.value = false)
      },
      ...(nutritionEnabled.value
        ? [
            {
              label: ready
                ? t.value('navigation_settings_profile_nutrition')
                : 'Profile: Nutrition',
              icon: 'i-heroicons-fire',
              to: '/profile/settings?tab=nutrition',
              onSelect: () => (open.value = false)
            }
          ]
        : []),
      {
        label: navLabel('navigation_settings_athlete_profile', 'Athlete Profile'),
        icon: 'i-lucide-user-2',
        to: '/profile/athlete',
        onSelect: () => (open.value = false)
      },
      ...(nutritionEnabled.value
        ? [
            {
              label: navLabel('navigation_search_nutrition_history', 'Nutrition: History'),
              icon: 'i-lucide-history',
              to: '/nutrition/history',
              onSelect: () => (open.value = false)
            }
          ]
        : []),
      {
        label: navLabel('navigation_settings_ai_coach_settings', 'AI Coach Settings'),
        icon: 'i-lucide-sparkles',
        to: '/settings/ai',
        onSelect: () => (open.value = false)
      },
      {
        label: ready
          ? t.value('navigation_settings_apps_connected')
          : 'Connected Apps (Strava, Garmin, Oura...)',
        icon: 'i-lucide-layout-grid',
        to: '/settings/apps',
        onSelect: () => (open.value = false)
      },
      {
        label: navLabel('navigation_settings_developer_settings', 'Developer Settings'),
        icon: 'i-lucide-code-2',
        to: '/settings/developer',
        onSelect: () => (open.value = false)
      },
      {
        label: navLabel('navigation_settings_release_notes', 'Release Notes'),
        icon: 'i-lucide-clipboard-list',
        to: '/settings/release-notes',
        onSelect: () => (open.value = false)
      },
      {
        label: navLabel('navigation_settings_changelog', 'Changelog'),
        icon: 'i-lucide-history',
        to: '/settings/changelog',
        onSelect: () => (open.value = false)
      },
      {
        label: navLabel('navigation_settings_privacy_policy', 'Privacy Policy'),
        icon: 'i-lucide-shield',
        to: '/privacy',
        onSelect: () => (open.value = false)
      }
    ]

    if (config.public.stripePublishableKey) {
      settingsItems.push({
        label: navLabel('navigation_settings_billing', 'Billing'),
        icon: 'i-lucide-credit-card',
        to: '/settings/billing',
        onSelect: () => (open.value = false)
      })
    }

    searchGroups.push({
      id: 'settings',
      label: navLabel('navigation_settings_title', 'Settings'),
      items: settingsItems
    })

    // 7. Admin Group (Only for Admins)
    if ((user.value as any)?.isAdmin) {
      searchGroups.push({
        id: 'admin',
        label: navLabel('navigation_admin', 'Admin'),
        items: [
          {
            label: navLabel('navigation_admin_nav_users', 'Users Management'),
            icon: 'i-lucide-users-2',
            to: '/admin/users',
            onSelect: () => (open.value = false)
          },
          {
            label: navLabel('navigation_admin_nav_subscriptions', 'Subscriptions'),
            icon: 'i-lucide-wallet',
            to: '/admin/subscriptions',
            onSelect: () => (open.value = false)
          },
          {
            label: navLabel('navigation_admin_nav_system_messages', 'System Messages'),
            icon: 'i-lucide-megaphone',
            to: '/admin/system-messages',
            onSelect: () => (open.value = false)
          },
          {
            label: navLabel('navigation_admin_nav_tickets', 'Tickets'),
            icon: 'i-lucide-bug',
            to: '/admin/issues',
            onSelect: () => (open.value = false)
          }
        ]
      })

      searchGroups.push({
        id: 'admin-stats',
        label: ready
          ? `${t.value('navigation_admin')}: ${t.value('navigation_admin_nav_statistics')}`
          : 'Admin: Statistics',
        items: [
          {
            label: navLabel('navigation_admin_nav_llm_overview', 'Overview Stats'),
            icon: 'i-lucide-bar-chart-3',
            to: '/admin/stats',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_stats_llm_performance')
              : 'LLM Performance & Costs',
            icon: 'i-lucide-brain-circuit',
            to: '/admin/stats/llm',
            onSelect: () => (open.value = false)
          },
          {
            label: navLabel('navigation_admin_nav_stats_user_analytics', 'User Analytics'),
            icon: 'i-lucide-trending-up',
            to: '/admin/stats/users',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_stats_developers')
              : 'Developer & API Stats',
            icon: 'i-lucide-code-2',
            to: '/admin/stats/developers',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_stats_webhook_performance')
              : 'Webhook Performance',
            icon: 'i-lucide-webhook',
            to: '/admin/stats/webhooks',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_stats_workout_sync')
              : 'Workout & Sync Stats',
            icon: 'i-lucide-activity',
            to: '/admin/stats/workouts',
            onSelect: () => (open.value = false)
          }
        ]
      })

      searchGroups.push({
        id: 'admin-monitoring',
        label: ready
          ? `${t.value('navigation_admin')}: ${t.value('navigation_admin_nav_monitoring_title')}`
          : 'Admin: Monitoring',
        items: [
          {
            label: ready
              ? t.value('navigation_admin_nav_monitoring_ai_logs_live')
              : 'AI Logs (Live)',
            icon: 'i-lucide-terminal',
            to: '/admin/ai/logs',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_monitoring_audit_security_logs')
              : 'Audit & Security Logs',
            icon: 'i-lucide-scroll-text',
            to: '/admin/audit-logs',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_monitoring_failed_requests')
              : 'Failed Requests',
            icon: 'i-lucide-alert-triangle',
            to: '/admin/ai/failed-requests',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_monitoring_trigger_queues')
              : 'Trigger.dev Queues',
            icon: 'i-lucide-layers',
            to: '/admin/queues',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_monitoring_native_webhooks')
              : 'Native Webhooks',
            icon: 'i-lucide-webhook',
            to: '/admin/webhooks',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_llm_global_settings')
              : 'Global LLM Settings',
            icon: 'i-lucide-settings-2',
            to: '/admin/llm/settings',
            onSelect: () => (open.value = false)
          }
        ]
      })

      searchGroups.push({
        id: 'admin-debug',
        label: ready
          ? `${t.value('navigation_admin')}: ${t.value('navigation_admin_nav_debug_title')}`
          : 'Admin: Debug Tools',
        items: [
          {
            label: ready
              ? t.value('navigation_admin_nav_debug_trigger_config')
              : 'Trigger.dev Config',
            icon: 'i-lucide-zap',
            to: '/admin/debug/trigger',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_debug_env_vars_config')
              : 'Env Vars & Config',
            icon: 'i-lucide-file-code',
            to: '/admin/debug/env',
            onSelect: () => (open.value = false)
          },
          {
            label: ready
              ? t.value('navigation_admin_nav_debug_database_explorer')
              : 'Database Explorer',
            icon: 'i-lucide-database',
            to: '/admin/debug/database',
            onSelect: () => (open.value = false)
          },
          {
            label: navLabel('navigation_admin_nav_debug_ping', 'Network Ping Tool'),
            icon: 'i-lucide-radio',
            to: '/admin/debug/ping',
            onSelect: () => (open.value = false)
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

  const activeArea = computed(() => getAthleteArea(route.path))
  const primaryNavigation = computed(() =>
    athletePrimaryNavigation.map((item) => ({
      ...item,
      label: navLabel(`journey_nav_${item.key}`, item.label)
    }))
  )
  const contextNavigation = computed(() =>
    getAthleteContextNavigation(activeArea.value).map((item) => ({
      ...item,
      label: navLabel(`journey_nav_${item.key}`, item.label)
    }))
  )
  const showQuickCapture = ref(false)
  const quickCapture = ref<{ focusInput: () => void } | null>(null)
  function onToolsCloseAutoFocus(event: Event) {
    if (showQuickCapture.value) {
      event.preventDefault()
      void nextTick(() => quickCapture.value?.focusInput())
    }
  }
  const tools = computed(() =>
    links.value.flat().filter((item) => {
      const path = typeof item.to === 'string' ? item.to : ''
      return (
        !['/dashboard', '/activities', '/performance', '/chat'].includes(path) &&
        item.label !== navLabel('navigation_settings_title', 'Settings')
      )
    })
  )
  const accountItems = computed(() => [
    [{ label: user.value?.name || navLabel('journey_account', 'Account'), type: 'label' as const }],
    [
      {
        label: navLabel('journey_tools', 'Explore tools'),
        icon: 'i-lucide-compass',
        onSelect: () => {
          open.value = true
        }
      },
      {
        label: navLabel('journey_profile', 'Your profile'),
        icon: 'i-lucide-user',
        to: '/profile/settings'
      },
      {
        label: navLabel('journey_connections', 'Connections'),
        icon: 'i-lucide-link',
        to: '/settings/apps'
      },
      {
        label: navLabel('journey_preferences', 'Coach preferences'),
        icon: 'i-lucide-sliders-horizontal',
        to: '/settings/ai'
      },
      ...(config.public.stripePublishableKey
        ? [
            {
              label: navLabel('navigation_settings_billing', 'Billing'),
              icon: 'i-lucide-credit-card',
              to: '/settings/billing'
            }
          ]
        : []),
      {
        label: navLabel('journey_settings', 'All settings'),
        icon: 'i-lucide-settings',
        to: '/settings'
      },
      {
        label:
          colorMode.value === 'dark'
            ? navLabel('journey_light_theme', 'Switch to light theme')
            : navLabel('journey_dark_theme', 'Switch to dark theme'),
        icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
        onSelect: () => {
          colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
        }
      },
      { label: navLabel('journey_help', 'Help'), icon: 'i-lucide-circle-help', to: '/help-center' }
    ],
    [
      {
        label: navLabel('journey_capture', 'Quick capture'),
        icon: 'i-lucide-notebook-pen',
        onSelect: () => {
          showQuickCapture.value = !showQuickCapture.value
        }
      },
      {
        label: showFullCoachingSuite.value
          ? navLabel('journey_coach_workspace', 'Coach workspace')
          : navLabel('journey_my_coaches', 'My coaches'),
        icon: 'i-lucide-users',
        to: showFullCoachingSuite.value ? '/coaching' : '/coaching/team'
      }
    ],
    [
      impersonatedEmail.value
        ? {
            label: navLabel('navigation_admin_nav_stop_impersonating', 'Stop impersonating'),
            icon: 'i-lucide-log-out',
            onSelect: () => {
              void stopImpersonation()
            }
          }
        : {
            label: navLabel('navigation_admin_nav_sign_out', 'Sign out'),
            icon: 'i-lucide-log-out',
            onSelect: () => {
              void logout('/login')
            }
          }
    ]
  ])

  function isContextActive(path: string) {
    if (path === '/activities' || path === '/workouts') return route.path === path
    if (path === '/library/workouts') return route.path.startsWith('/library')
    return route.path === path || route.path.startsWith(`${path}/`)
  }

  function onPrimaryNavigation(path: string, label: string) {
    trackNavClick(path, label)
    open.value = false
    showQuickCapture.value = false
  }

  function openCapture() {
    open.value = false
    showQuickCapture.value = true
  }

  function openTools() {
    open.value = true
  }

  watch(
    () => route.path,
    () => {
      open.value = false
      showQuickCapture.value = false
    }
  )
</script>

<template>
  <UDashboardGroup
    unit="rem"
    class="journey-app !relative !inset-auto h-dvh min-h-0 flex-col print:static print:inset-auto print:block print:h-auto print:overflow-visible"
  >
    <a href="#athlete-content" class="journey-skip-link">{{
      navLabel('journey_skip', 'Skip to content')
    }}</a>
    <header class="journey-header print:hidden">
      <NuxtLink
        to="/dashboard"
        class="journey-brand"
        :aria-label="navLabel('journey_home', 'Coach Watts home')"
      >
        <img src="/media/logo.webp" width="32" height="32" alt="" class="size-8 object-contain" />
        <span>Coach Watts</span>
      </NuxtLink>
      <nav
        class="journey-primary-nav"
        :aria-label="navLabel('journey_navigation', 'Main navigation')"
      >
        <NuxtLink
          v-for="item in primaryNavigation"
          :key="item.key"
          :to="item.to"
          :aria-current="activeArea === item.key ? 'page' : undefined"
          :class="{ 'is-active': activeArea === item.key }"
          @click="onPrimaryNavigation(item.to, item.label)"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
      <div class="journey-header-actions">
        <UButton
          to="/chat"
          color="neutral"
          variant="ghost"
          icon="i-lucide-message-circle"
          :aria-label="navLabel('journey_coach', 'Ask Coach')"
          class="journey-coach-button"
        >
          <span class="hidden lg:inline">{{ navLabel('journey_coach', 'Ask Coach') }}</span>
        </UButton>
        <UDashboardSearchButton
          collapsed
          :kbds="[]"
          :label="navLabel('navigation_search_title', 'Search')"
          class="journey-icon-button"
        />
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-compass"
          :aria-label="navLabel('journey_tools', 'Explore tools')"
          class="journey-icon-button hidden sm:inline-flex"
          @click="openTools"
        />
        <ColorModeButton class="journey-theme-button hidden md:inline-flex" />
        <UDropdownMenu
          :items="accountItems"
          :content="{ align: 'end', onCloseAutoFocus: onToolsCloseAutoFocus }"
        >
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-user-round"
            :aria-label="navLabel('journey_account', 'Account')"
            class="journey-icon-button"
          />
        </UDropdownMenu>
      </div>
    </header>
    <nav
      v-if="contextNavigation.length"
      class="journey-context-nav print:hidden"
      :aria-label="navLabel('journey_section_navigation', 'Section navigation')"
    >
      <NuxtLink
        v-for="item in contextNavigation"
        :key="item.key"
        :to="item.to"
        :aria-current="isContextActive(item.to) ? 'page' : undefined"
        :class="{ 'is-active': isContextActive(item.to) }"
        @click="onPrimaryNavigation(item.to, item.label)"
        >{{ item.label }}</NuxtLink
      >
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-compass"
        size="sm"
        :aria-label="navLabel('journey_tools', 'Explore tools')"
        class="ms-auto sm:hidden"
        @click="openTools"
      />
    </nav>
    <main id="athlete-content" class="journey-stage" tabindex="-1">
      <slot />
    </main>
    <UDashboardSearch
      :key="tolgee.getLanguage()"
      :groups="groups"
      :input="searchInputProps"
      :title="navLabel('navigation_search_title', 'Search')"
      :description="
        navLabel('navigation_search_description', 'Search pages, workouts, and shortcuts')
      "
    />
    <UModal
      v-model:open="open"
      :title="navLabel('journey_tools', 'Explore tools')"
      :description="
        navLabel('journey_tools_description', 'Find a useful next step for your training.')
      "
      :ui="{ content: 'journey-tools-dialog max-w-xl' }"
      :content="{ onCloseAutoFocus: onToolsCloseAutoFocus }"
    >
      <template #body>
        <UNavigationMenu
          :items="tools"
          orientation="vertical"
          :ui="{ link: 'min-h-11 py-2.5', linkLeadingIcon: 'size-5' }"
        />
        <div class="journey-tools-footer">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-notebook-pen"
            @click="openCapture"
            >{{ navLabel('journey_capture', 'Quick capture') }}</UButton
          >
          <UButton color="neutral" variant="ghost" to="/settings">{{
            navLabel('journey_settings', 'All settings')
          }}</UButton>
          <span class="text-xs text-muted" :title="buildVersionDisplay">{{
            sidebarVersionDisplay
          }}</span>
        </div>
      </template>
    </UModal>
    <ClientOnly>
      <AiQuickCapture
        v-if="showQuickCapture"
        ref="quickCapture"
        manual
        @close="showQuickCapture = false"
      />
      <DashboardTriggerMonitor v-model="showTriggerMonitor" />
      <ImpersonationBanner />
    </ClientOnly>
  </UDashboardGroup>
</template>
