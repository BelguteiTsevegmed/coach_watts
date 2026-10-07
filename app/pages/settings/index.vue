<script setup lang="ts">
  const route = useRoute()

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Settings',
    meta: [
      {
        name: 'description',
        content: 'Manage your connected apps, AI preferences, and coaching settings.'
      }
    ]
  })

  // Preserve legacy callback destinations, while ordinary visits start with an overview.
  if (Object.keys(route.query).length) {
    await navigateTo({ path: '/settings/apps', query: route.query }, { replace: true })
  }

  const sections = [
    {
      title: 'Your profile',
      description: 'Your activities, availability, and training preferences.',
      to: '/profile/settings',
      icon: 'i-lucide-user-round'
    },
    {
      title: 'Connections',
      description: 'Bring your training and recovery data into Coach Watts.',
      to: '/settings/apps',
      icon: 'i-lucide-link'
    },
    {
      title: 'Coach preferences',
      description: 'Choose the guidance and level of detail that suit you.',
      to: '/settings/ai',
      icon: 'i-lucide-message-circle'
    }
  ]
</script>

<template>
  <section class="settings-overview">
    <header>
      <h1>Make it yours</h1>
      <p>A few preferences help Coach Watts fit the way you train.</p>
    </header>
    <div class="settings-overview__list">
      <NuxtLink
        v-for="section in sections"
        :key="section.to"
        :to="section.to"
        class="settings-overview__link"
      >
        <UIcon :name="section.icon" class="size-5 shrink-0 text-muted" />
        <div>
          <h2>{{ section.title }}</h2>
          <p>{{ section.description }}</p>
        </div>
        <UIcon name="i-lucide-chevron-right" class="size-4 ms-auto shrink-0" />
      </NuxtLink>
    </div>
    <details class="settings-overview__advanced">
      <summary>More settings</summary>
      <NuxtLink to="/settings/developer">Developer tools</NuxtLink>
      <NuxtLink to="/settings/danger">Account and data management</NuxtLink>
      <NuxtLink to="/settings/changelog">What’s changed</NuxtLink>
    </details>
    <UButton to="/dashboard" color="neutral" variant="link" icon="i-lucide-arrow-left"
      >Back to Today</UButton
    >
  </section>
</template>

<style scoped>
  .settings-overview {
    max-width: 48rem;
    margin: 1.5rem auto;
  }
  h1 {
    font-size: clamp(1.75rem, 3vw, 2.5rem);
    font-weight: 600;
    letter-spacing: -0.025em;
  }
  header p {
    margin: 0.75rem 0 2rem;
    color: var(--ui-text-muted);
    line-height: 1.6;
  }
  .settings-overview__link {
    display: flex;
    gap: 1rem;
    align-items: center;
    min-height: 5.5rem;
    padding: 1.25rem 0;
    border-top: 1px solid var(--ui-border);
  }
  h2 {
    font-size: 1rem;
    font-weight: 600;
  }
  .settings-overview__link p {
    color: var(--ui-text-muted);
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  .settings-overview__link:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 4px;
  }
  .settings-overview__advanced {
    border-block: 1px solid var(--ui-border);
    margin: 0.5rem 0 1.5rem;
  }
  summary {
    cursor: pointer;
    padding: 1rem 0;
  }
  .settings-overview__advanced a {
    display: flex;
    align-items: center;
    min-height: 2.75rem;
    color: var(--ui-text-muted);
    font-size: 0.875rem;
  }
</style>
