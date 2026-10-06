<template>
  <UDashboardPanel id="training-plan-page">
    <template #body>
      <div
        class="mx-auto w-full max-w-[52rem] space-y-8 px-5 py-8 sm:px-10 sm:py-10 quick-capture-inset"
      >
        <div class="flex flex-wrap items-start justify-between gap-5">
          <div class="max-w-xl">
            <h1
              class="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl"
            >
              Training plan
            </h1>
            <p class="mt-3 leading-7 text-gray-600 dark:text-gray-400">
              A clear week, shaped around your goal and the time you have.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <ClientOnly><DashboardTriggerMonitorButton /></ClientOnly>
            <UDropdownMenu v-if="activePlan" :items="planPageActions"
              ><UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-ellipsis-horizontal"
                aria-label="Plan actions"
                >Plan actions</UButton
              ></UDropdownMenu
            >
          </div>
        </div>
        <p
          v-if="loading && !activePlan"
          role="status"
          aria-live="polite"
          class="py-8 text-gray-500"
        >
          Loading your training plan…
        </p>
        <div v-else-if="status === 'error' && !activePlan" role="alert" class="space-y-3 py-8">
          <h2 class="text-xl font-medium">Your plan could not load</h2>
          <p class="text-gray-500">Try again to load your current plan.</p>
          <UButton color="neutral" variant="outline" @click="fetchActivePlan">Try again</UButton>
        </div>
        <!-- Active Plan View -->
        <div v-else-if="activePlan">
          <PlanDashboard
            :key="activePlan.id"
            :plan="activePlan"
            :user-ftp="userFtp"
            :is-generating="isPolling"
            :should-auto-generate="autoTriggerStructure"
            @refresh="fetchActivePlan"
            @generation-started="autoTriggerStructure = false"
          />
        </div>

        <div v-else class="max-w-xl space-y-5 py-8" data-testid="plan-empty">
          <h2 class="text-2xl font-medium">What do you want to work toward?</h2>
          <p class="leading-7 text-gray-600 dark:text-gray-400">
            Choose a goal and tell us when you can train. We will turn that into a week you can
            follow.
          </p>
          <UButton size="lg" color="primary" @click.stop="openWizard">Create my plan</UButton>
          <p class="text-sm text-gray-500">
            Have a plan saved already?
            <NuxtLink to="/plans" class="text-primary underline underline-offset-4"
              >Browse saved plans</NuxtLink
            >.
          </p>
        </div>
        <!-- Plan Wizard Modal -->
        <!-- Only render if explicitly open to prevent ghost clicks -->
        <UModal
          v-if="showWizard"
          v-model:open="showWizard"
          :ui="{ content: 'w-full sm:max-w-4xl' }"
          title="Create your training plan"
          description="Start with your goal and availability, then review your week."
        >
          <template #body>
            <div class="p-6">
              <PlanWizard @close="showWizard = false" @plan-created="onPlanCreated" />
            </div>
          </template>
        </UModal>

        <!-- Share Plan Modal -->
        <UModal
          v-model:open="isShareModalOpen"
          title="Share your training plan"
          description="Create a read-only link to your training plan and share it directly to social platforms."
        >
          <template #body>
            <ShareAccessPanel
              :link="shareLink"
              :loading="generatingShareLink"
              :expiry-value="shareExpiryValue"
              resource-label="training plan"
              :share-title="
                activePlan?.goal?.title
                  ? `Training Plan: ${activePlan.goal.title}`
                  : 'Training plan shared from Coach Wattz'
              "
              @update:expiry-value="shareExpiryValue = $event"
              @generate="generateShareLink"
              @copy="copyToClipboard"
            />
          </template>
          <template #footer>
            <UButton
              label="Close"
              color="neutral"
              variant="ghost"
              @click="
                () => {
                  isShareModalOpen = false
                }
              "
            />
          </template>
        </UModal>

        <!-- New Plan Confirmation Modal -->
        <UModal
          v-model:open="isArchiveModalOpen"
          title="Create a new plan"
          description="Create a new plan? This will archive your current active plan."
        >
          <template #footer>
            <div class="flex justify-end gap-2 w-full">
              <UButton
                color="neutral"
                variant="ghost"
                @click="
                  () => {
                    isArchiveModalOpen = false
                  }
                "
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                @click="
                  async () => {
                    isArchiveModalOpen = false
                    await abandonActivePlan()
                    openWizard()
                  }
                "
              >
                Create Plan
              </UButton>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import PlanWizard from '~/components/plans/PlanWizard.vue'
  import PlanDashboard from '~/components/plans/PlanDashboard.vue'

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Training plan'
  })

  const route = useRoute()
  // Setup may return to Today after successful activation; arbitrary redirect targets are ignored.
  const returnToToday = computed(() => route.query.returnTo === '/dashboard')
  const showWizard = ref(false)
  const isPolling = ref(false)
  const autoTriggerStructure = ref(false)
  const isArchiveModalOpen = ref(false)
  const toast = useToast()

  // Share state
  const isShareModalOpen = ref(false)
  const shareExpiryValue = ref('2592000')

  const { data, status, refresh } = (await (useFetch as any)('/api/plans/active')) as any
  const activePlan = computed(() => data.value?.plan)

  const { shareLink, generatingShareLink, generateShareLink } = useResourceShare(
    'TRAINING_PLAN',
    computed(() => activePlan.value?.id)
  )
  const planPageActions = computed(() => [
    [
      {
        label: 'Share this plan',
        icon: 'i-heroicons-share',
        onSelect: () => {
          isShareModalOpen.value = true
        }
      },
      { label: 'Saved plans', icon: 'i-heroicons-bookmark', to: '/plans' },
      {
        label: 'Create a new plan',
        icon: 'i-heroicons-plus',
        onSelect: () => {
          startNewPlan()
        }
      }
    ]
  ])
  const userFtp = computed(() => data.value?.userFtp)
  const loading = computed(() => status.value === 'pending')

  const copyToClipboard = () => {
    if (!shareLink.value) return

    navigator.clipboard.writeText(shareLink.value)
    toast.add({
      title: 'Copied',
      description: 'Share link copied to clipboard.',
      color: 'success'
    })
  }

  // Watch for share modal opening to generate link if it doesn't exist
  watch(isShareModalOpen, (newValue) => {
    if (newValue && !shareLink.value) {
      generateShareLink()
    }
  })

  // Watch for plan changes to reset share link
  watch(
    () => activePlan.value?.id,
    () => {
      shareLink.value = ''
    }
  )

  function fetchActivePlan() {
    refresh()
  }

  function openWizard() {
    showWizard.value = true
  }

  async function abandonActivePlan() {
    if (!activePlan.value?.id) return

    try {
      await $fetch<any, string & {}>(`/api/plans/${activePlan.value.id}/abandon`, {
        method: 'POST'
      })
      // Clear local state
      data.value.plan = null
    } catch (error) {
      console.error('Failed to abandon plan:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to archive current plan.',
        color: 'error'
      })
    }
  }

  function startNewPlan() {
    isArchiveModalOpen.value = true
  }

  async function onPlanCreated(plan: any) {
    // Optimistic update
    if (!data.value) data.value = {}
    data.value.plan = plan

    showWizard.value = false

    toast.add({
      title: 'Plan Created',
      description: 'AI is generating your workouts. This may take a moment.',
      color: 'info'
    })

    // Setup returns to Today after activation; task monitoring there continues generation.
    if (returnToToday.value) {
      await navigateTo('/dashboard')
      return
    }
    startPolling()
  }

  function startPolling() {
    if (isPolling.value) return
    isPolling.value = true

    let attempts = 0
    const maxAttempts = 20 // 1 minute

    const interval = setInterval(async () => {
      attempts++
      await refresh()

      // Check if first block has workouts
      const hasWorkouts = activePlan.value?.blocks?.[0]?.weeks?.[0]?.workouts?.length > 0

      if (hasWorkouts || attempts >= maxAttempts) {
        clearInterval(interval)
        isPolling.value = false
        if (hasWorkouts) {
          toast.add({
            title: 'Workouts Ready',
            description: 'Your training plan has been populated.',
            color: 'success'
          })

          // Pass a signal to PlanDashboard to auto-generate structure
          autoTriggerStructure.value = true
        } else {
          toast.add({
            title: 'Generation Still In Progress',
            description:
              'Workout generation is taking longer than expected. Refresh the page or check back shortly.',
            color: 'warning'
          })
        }
      }
    }, 3000)
  }

  // Safety: Close wizard if plan exists
</script>
