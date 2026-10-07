<template>
  <div class="journey-entry">
    <section class="journey-entry__intro">
      <p class="text-sm text-primary-300">Coach Watts</p>
      <h1>{{ tr('journey_entry_title', 'A clear next step for your training.') }}</h1>
      <p class="journey-entry__lead">
        {{
          tr(
            'journey_entry_description',
            'Check in, prepare for today, and learn from each session. Your coach keeps the bigger picture in view.'
          )
        }}
      </p>
      <UButton to="/join" color="primary" size="xl">{{
        tr('journey_entry_action', 'Start your journey')
      }}</UButton>
      <NuxtLink to="/login" class="journey-entry__signin">{{
        tr('nav.sign_in', 'Sign in')
      }}</NuxtLink>
    </section>
    <section
      id="how-it-works"
      class="journey-entry__steps"
      :aria-label="tr('nav.how_it_works', 'How it works')"
    >
      <div>
        <span class="text-sm text-muted">01</span>
        <h2>{{ tr('journey_entry_today', 'Begin with today') }}</h2>
        <p>
          {{
            tr(
              'journey_entry_today_description',
              'Share how you feel. See the next useful action for your day.'
            )
          }}
        </p>
      </div>
      <div>
        <span class="text-sm text-muted">02</span>
        <h2>{{ tr('journey_entry_prepare', 'Prepare, then train') }}</h2>
        <p>
          {{
            tr(
              'journey_entry_prepare_description',
              'Understand the purpose of your session. Open fueling and training details when you need them.'
            )
          }}
        </p>
      </div>
      <div>
        <span class="text-sm text-muted">03</span>
        <h2>{{ tr('journey_entry_reflect', 'Reflect and move forward') }}</h2>
        <p>
          {{
            tr(
              'journey_entry_reflect_description',
              'Leave a short reflection and see how your training develops over time.'
            )
          }}
        </p>
      </div>
    </section>
    <section class="journey-entry__depth">
      <details>
        <summary>{{ tr('journey_entry_more', 'Explore what your coach can help with') }}</summary>
        <LandingNutritionExplainer /><LandingFeatureGoals /><LandingFeatureBento />
      </details>
      <details>
        <summary>
          {{ tr('journey_entry_connections', 'Connect the tools you already use') }}
        </summary>
        <LandingIntegrations />
      </details>

      <details>
        <summary>{{ tr('journey_entry_stories', 'Stories from the community') }}</summary>
        <LandingCommunity />
      </details>
      <details>
        <summary>{{ tr('journey_entry_architecture', 'How Coach Watts works') }}</summary>
        <LandingDeepDiveArchitecture />
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'

  const { t } = useTranslate('common')
  const { status } = useAuth()
  function tr(key: string, fallback: string) {
    const value = t.value(key)
    return value === key ? fallback : value
  }

  definePageMeta({
    layout: 'home',
    auth: false
  })

  useSeoMeta({
    title: () => t.value('seo.home_title'),
    ogTitle: () => t.value('seo.home_og_title'),
    description: () => t.value('seo.home_description'),
    ogDescription: () => t.value('seo.home_description'),
    ogImage: '/images/og-image.png',
    twitterCard: 'summary_large_image',
    twitterTitle: () => t.value('seo.home_og_title'),
    twitterDescription: () => t.value('seo.home_description'),
    twitterImage: '/images/og-image.png'
  })

  const route = useRoute()

  // Only redirect if authenticated, otherwise stay on landing page.
  // ?preview=1 keeps the marketing page visible under AUTH_BYPASS_USER.
  watchEffect(() => {
    if (status.value === 'authenticated' && route.query.preview !== '1') {
      navigateTo('/dashboard')
    }
  })
</script>

<style scoped>
  .journey-entry {
    background: #152523;
    color: #edf5f2;
    padding: 4rem 1.5rem;
  }
  .journey-entry__intro,
  .journey-entry__steps,
  .journey-entry__depth {
    max-width: 50rem;
    margin-inline: auto;
  }
  .journey-entry__intro {
    padding-block: 1rem 4rem;
  }
  h1 {
    font-size: clamp(2.25rem, 5vw, 4rem);
    line-height: 1.12;
    letter-spacing: -0.04em;
    font-weight: 600;
    max-width: 14ch;
    margin-top: 1.5rem;
  }
  .journey-entry__lead {
    color: #a7bbb5;
    font-size: 1.125rem;
    line-height: 1.7;
    max-width: 40rem;
    margin-block: 1.5rem 2rem;
  }
  .journey-entry__signin {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    margin-inline-start: 1.5rem;
    color: #a7bbb5;
  }
  .journey-entry__steps > div {
    padding: 2rem 0;
    border-top: 1px solid #354e47;
  }
  h2 {
    font-size: 1.375rem;
    font-weight: 500;
    margin-block: 0.5rem;
  }
  .journey-entry__steps p {
    color: #a7bbb5;
    max-width: 40rem;
    line-height: 1.7;
  }
  .journey-entry__depth {
    margin-top: 3rem;
  }
  details {
    border-top: 1px solid #354e47;
  }
  details > summary {
    padding: 1.25rem 0;
    cursor: pointer;
    color: #a7bbb5;
  }
  a:focus-visible,
  summary:focus-visible {
    outline: 2px solid #93c9bc;
    outline-offset: 4px;
  }
  @media (max-width: 640px) {
    .journey-entry {
      padding: 2rem 1.25rem;
    }
  }
</style>
