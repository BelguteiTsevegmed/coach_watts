<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="route.path !== '/settings'">
        <div class="flex flex-wrap items-center gap-4 w-full">
          <NuxtLink
            to="/settings"
            class="text-sm min-h-11 inline-flex items-center gap-2 text-muted"
          >
            <UIcon name="i-lucide-arrow-left" class="size-4" /> All settings
          </NuxtLink>
          <UDropdownMenu
            :items="settingsTabs.map((tab) => ({ label: tab.label, icon: tab.icon, to: tab.id }))"
          >
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-chevron-down"
              trailing
              class="ms-auto"
              >{{ activeSettingsLabel }}</UButton
            >
          </UDropdownMenu>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="w-full p-0 sm:p-6" :class="isFullWidth ? 'max-w-full' : 'max-w-4xl mx-auto'">
        <div class="px-4 sm:px-0">
          <NuxtPage />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  const route = useRoute()

  const settingsTabs = [
    { id: '/settings/apps', label: 'Connections', icon: 'i-lucide-plug' },
    { id: '/settings/ai', label: 'Coach preferences', icon: 'i-heroicons-sparkles' },
    { id: '/settings/billing', label: 'Billing', icon: 'i-heroicons-credit-card' },
    { id: '/settings/developer', label: 'Developer', icon: 'i-heroicons-code-bracket' },
    { id: '/settings/danger', label: 'Account and data', icon: 'i-lucide-alert-triangle' }
  ]

  const activeSettingsLabel = computed(
    () => settingsTabs.find((tab) => isActive(tab.id))?.label || 'Settings sections'
  )

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Settings',
    meta: [
      {
        name: 'description',
        content: 'Manage your Coach Watts account, connected apps, and AI preferences.'
      }
    ]
  })

  function isActive(path: string): boolean {
    return route.path === path
  }

  const isFullWidth = computed(() => {
    return (
      route.path === '/settings/ai' ||
      route.path.startsWith('/settings/llm') ||
      route.path === '/settings/billing'
    )
  })
</script>
