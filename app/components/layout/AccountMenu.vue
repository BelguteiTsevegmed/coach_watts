<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import type { DropdownMenuItem } from '@nuxt/ui'

  /**
   * Avatar button + account menu shared by the desktop sidebar footer and the
   * mobile drawer footer. Settings shortcuts come from the app navigation model
   * (`useAppNavigation().accountMenuLinks`); community links and the session
   * actions are appended here.
   */
  const props = defineProps<{
    user: { name?: string | null; email?: string | null } | null | undefined
    impersonatedEmail?: string | null
    /** Secondary line under the name (e.g. the app version). */
    subtitle?: string
    /** Settings shortcuts, rendered as the first group. */
    settingsItems?: DropdownMenuItem[]
    /** Icon-only trigger for the collapsed desktop sidebar. */
    collapsed?: boolean
  }>()

  const emit = defineEmits<{
    logout: []
    stopImpersonation: []
  }>()

  const { t } = useTranslate('common')

  function label(key: string, fallback: string) {
    if (typeof t.value !== 'function') return fallback
    const translated = t.value(key)
    return !translated || translated === key ? fallback : translated
  }

  const displayName = computed(
    () => props.user?.name || props.impersonatedEmail || props.user?.email || 'Account'
  )

  const items = computed<DropdownMenuItem[][]>(() => {
    const groups: DropdownMenuItem[][] = []

    if (props.settingsItems?.length) {
      groups.push(props.settingsItems)
    }

    groups.push([
      {
        label: label('navigation_settings_changelog', 'Changelog'),
        icon: 'i-lucide-scroll-text',
        to: '/settings/changelog'
      },
      {
        label: label('sidebar_community_discord', 'Discord'),
        icon: 'i-simple-icons-discord',
        to: 'https://discord.gg/dPYkzg49T9',
        target: '_blank'
      },
      {
        label: label('sidebar_community_github', 'GitHub'),
        icon: 'i-simple-icons-github',
        to: 'https://github.com/newpush/coach',
        target: '_blank'
      },
      {
        label: label('sidebar_attribution_strava', 'Powered by Strava'),
        icon: 'i-simple-icons-strava',
        to: 'https://www.strava.com/clubs/2004142',
        target: '_blank'
      },
      {
        label: label('sidebar_attribution_garmin', 'Works with Garmin'),
        icon: 'i-lucide-watch',
        to: 'https://www.garmin.com',
        target: '_blank'
      }
    ])

    groups.push([
      props.impersonatedEmail
        ? {
            label: label('navigation_admin_nav_stop_impersonating', 'Stop impersonating'),
            icon: 'i-lucide-user-x',
            color: 'warning',
            onSelect: () => emit('stopImpersonation')
          }
        : {
            label: label('navigation_admin_nav_sign_out', 'Sign out'),
            icon: 'i-lucide-log-out',
            onSelect: () => emit('logout')
          }
    ])

    return groups
  })

  const ariaLabel = computed(() => label('sidebar_account_menu', 'Account menu'))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="collapsed ? { side: 'right', align: 'end' } : { side: 'top', align: 'start' }"
    :ui="{ content: 'min-w-60' }"
  >
    <button
      type="button"
      class="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-elevated/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="collapsed ? 'justify-center' : 'flex-1'"
      :aria-label="ariaLabel"
    >
      <UAvatar v-if="user" :alt="user.email || ''" size="sm" />
      <template v-if="!collapsed">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">{{ displayName }}</p>
          <p
            v-if="impersonatedEmail"
            class="truncate text-[11px] font-medium text-warning"
            :title="impersonatedEmail"
          >
            {{ label('navigation_account_impersonating', 'Impersonating') }}
          </p>
          <p v-else-if="subtitle" class="truncate text-[11px] text-muted">{{ subtitle }}</p>
        </div>
        <UIcon
          name="i-lucide-chevrons-up-down"
          class="size-4 shrink-0 text-muted"
          aria-hidden="true"
        />
      </template>
    </button>
  </UDropdownMenu>
</template>
