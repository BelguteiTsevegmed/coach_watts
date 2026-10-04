<script setup lang="ts">
  import type { DropdownMenuItem } from '@nuxt/ui'

  defineProps<{
    user: { name?: string | null; email?: string | null } | null | undefined
    impersonatedEmail?: string | null
    stoppingImpersonation?: boolean
    sidebarVersionDisplay: string
    /** Settings shortcuts from the app navigation model. */
    settingsItems?: DropdownMenuItem[]
  }>()

  const emit = defineEmits<{
    logout: []
    stopImpersonation: []
  }>()
</script>

<template>
  <div class="border-t border-default px-3 py-2 lg:hidden">
    <div class="flex items-center gap-2">
      <LayoutAccountMenu
        :user="user"
        :impersonated-email="impersonatedEmail"
        :subtitle="sidebarVersionDisplay"
        :settings-items="settingsItems"
        @logout="emit('logout')"
        @stop-impersonation="emit('stopImpersonation')"
      />
      <ColorModeButton />
    </div>
  </div>
</template>
