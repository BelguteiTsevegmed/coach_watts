<template>
  <UDashboardPanel id="my-plans">
    <template #body>
      <div class="mx-auto w-full max-w-[52rem] space-y-10 px-5 py-8 sm:px-10 sm:py-10">
        <div class="max-w-xl">
          <h1
            class="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl"
          >
            Your plans
          </h1>
          <p class="mt-3 leading-7 text-gray-600 dark:text-gray-400">
            Keep your current training close. Revisit earlier plans when they are useful.
          </p>
        </div>
        <p v-if="plansPending" role="status" class="py-6 text-gray-500">Loading your plans…</p>
        <div v-else-if="plansError" role="alert" class="space-y-3">
          <p>Your saved plans could not load. Try again to see your training history.</p>
          <UButton color="neutral" variant="outline" @click="refresh()">Try again</UButton>
        </div>
        <section
          v-else
          class="space-y-5"
          aria-labelledby="current-plan-title"
          data-testid="saved-current-plan"
        >
          <h2 id="current-plan-title" class="text-xl font-medium">
            {{ currentPlan ? 'Your current plan' : 'Start with your next goal' }}
          </h2>
          <template v-if="currentPlan">
            <p class="text-2xl font-medium tracking-tight">
              {{ currentPlan.goal?.title || currentPlan.name || 'Training plan' }}
            </p>
            <p v-if="currentPlan.targetDate" class="text-sm text-gray-500">
              Working toward {{ formatDate(currentPlan.targetDate) }}
            </p>
            <UButton to="/plan" color="primary">Continue my plan</UButton>
          </template>
          <template v-else>
            <p class="max-w-xl leading-7 text-gray-500">
              Choose what you want to work toward and how much time you have. Your plan starts
              there.
            </p>
            <UButton to="/plan" color="primary">Create my plan</UButton>
          </template>
        </section>
        <div
          class="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800"
        >
          <details class="py-6" data-testid="saved-plan-history">
            <summary
              class="cursor-pointer text-lg font-medium focus-visible:outline-2 focus-visible:outline-primary"
            >
              Earlier plans<span class="ml-3 text-sm font-normal text-gray-500">{{
                history.length
              }}</span>
            </summary>
            <div class="mt-5 space-y-4">
              <p v-if="history.length === 0" class="text-sm leading-6 text-gray-500">
                Earlier plans will appear here after you finish or archive them.
              </p>
              <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
                <button
                  v-for="plan in paginatedHistory"
                  :key="plan.id"
                  type="button"
                  class="flex w-full items-center justify-between gap-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-primary"
                  @click="viewPlan(plan.id)"
                >
                  <span
                    ><span class="block text-sm font-medium">{{
                      plan.goal?.title || plan.name || 'Training plan'
                    }}</span
                    ><span class="mt-1 block text-xs text-gray-500"
                      >{{ formatDate(plan.createdAt) }}, {{ formatPlanStatus(plan.status) }}</span
                    ></span
                  >
                  <UIcon
                    name="i-heroicons-chevron-right"
                    class="size-4 text-gray-400"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <div v-if="history.length > 3" class="flex items-center gap-3 pt-3">
                <UButton
                  v-if="!showAllHistory"
                  color="neutral"
                  variant="ghost"
                  @click="
                    () => {
                      showAllHistory = true
                    }
                  "
                  >View all {{ history.length }} plans</UButton
                >
                <template v-else>
                  <UButton
                    :disabled="currentHistoryPage === 1"
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-chevron-left"
                    aria-label="Previous page"
                    @click="previousPage()"
                  />
                  <span class="text-sm text-gray-500"
                    >Page {{ currentHistoryPage }} of {{ totalHistoryPages }}</span
                  >
                  <UButton
                    :disabled="currentHistoryPage === totalHistoryPages"
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-chevron-right"
                    aria-label="Next page"
                    @click="nextPage()"
                  />
                </template>
              </div>
            </div>
          </details>
          <details class="py-6" data-testid="saved-plan-templates">
            <summary
              class="cursor-pointer text-lg font-medium focus-visible:outline-2 focus-visible:outline-primary"
            >
              Reusable plans<span class="ml-3 text-sm font-normal text-gray-500">{{
                templates.length
              }}</span>
            </summary>
            <div class="mt-5 space-y-4">
              <p v-if="templates.length === 0" class="text-sm leading-6 text-gray-500">
                Save a plan as a template when you want to use it again.
              </p>
              <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
                <div
                  v-for="plan in templates"
                  :key="plan.id"
                  class="flex flex-wrap items-center justify-between gap-4 py-5"
                >
                  <button
                    type="button"
                    class="min-w-0 max-w-xl text-left focus-visible:outline-2 focus-visible:outline-primary"
                    @click="viewPlan(plan.id)"
                  >
                    <span class="block text-sm font-medium">{{
                      plan.name || 'Saved template'
                    }}</span
                    ><span class="mt-1 block text-sm leading-6 text-gray-500">{{
                      plan.description || plan.goal?.title || 'A plan you can use again.'
                    }}</span
                    ><span v-if="getTotalWeeks(plan)" class="mt-1 block text-xs text-gray-500"
                      >{{ getTotalWeeks(plan) }} weeks</span
                    >
                  </button>
                  <div class="flex items-center gap-1">
                    <UButton
                      color="neutral"
                      variant="outline"
                      :loading="loadingId === plan.id"
                      @click="useTemplate(plan)"
                      >Use this plan</UButton
                    >
                    <UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-heroicons-trash"
                      :aria-label="`Delete ${plan.name || 'saved template'}`"
                      :loading="deletingId === plan.id"
                      @click="deleteTemplate(plan.id)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Use Template Modal -->
  <UModal
    v-model:open="isModalOpen"
    title="Use Template"
    description="When do you want to start this training plan?"
  >
    <template #body>
      <UFormField label="Start Date">
        <UInput v-model="startDate" type="date" />
      </UFormField>
    </template>

    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="
          () => {
            isModalOpen = false
          }
        "
      />
      <UButton
        label="Start Plan"
        color="primary"
        :loading="activating"
        @click="
          () => {
            void confirmUse()
          }
        "
      />
    </template>
  </UModal>

  <!-- Plan Detail Modal -->
  <PlanOverviewModal
    v-model:open="isPlanDetailOpen"
    :plan="selectedPlanDetail"
    :loading="loadingPlanDetail"
  >
    <template #footer-actions>
      <div class="flex justify-between items-center w-full">
        <UButton
          v-if="selectedPlanDetail?.isTemplate"
          label="Use Template"
          color="primary"
          icon="i-heroicons-play"
          @click="
            () => {
              void useTemplateFromDetail()
            }
          "
        />
        <UButton
          label="Close"
          color="neutral"
          variant="ghost"
          @click="
            () => {
              isPlanDetailOpen = false
            }
          "
        />
      </div>
    </template>
  </PlanOverviewModal>

  <!-- Delete Template Confirmation Modal -->
  <UModal
    v-model:open="isDeleteModalOpen"
    title="Delete Template"
    description="Are you sure you want to permanently delete this template?"
  >
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          @click="
            () => {
              isDeleteModalOpen = false
            }
          "
        >
          Cancel
        </UButton>
        <UButton
          color="error"
          :loading="deletingId !== null"
          @click="
            () => {
              void executeDeleteTemplate()
            }
          "
        >
          Delete
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import PlanOverviewModal from '~/components/plans/PlanOverviewModal.vue'

  const {
    formatDate: baseFormatDate,
    formatDateUTC,
    formatShortDate,
    getUserLocalDate
  } = useFormat()

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'My Plans'
  })

  const {
    data: plans,
    refresh,
    pending: plansPending,
    error: plansError
  } = (await useAsyncData<any[]>('user-plans', () => ($fetch as any)('/api/plans'))) as any
  const toast = useToast()

  const templates = computed(() => plans.value?.filter((p: any) => p.isTemplate) || [])
  const currentPlan = computed(
    () => plans.value?.find((p: any) => !p.isTemplate && p.status === 'ACTIVE') || null
  )
  const history = computed(
    () => plans.value?.filter((p: any) => !p.isTemplate && p.status !== 'ACTIVE') || []
  )
  const planStatusLabels: Record<string, string> = {
    COMPLETED: 'Completed',
    ABANDONED: 'Abandoned',
    ARCHIVED: 'Archived',
    DRAFT: 'Draft'
  }
  const formatPlanStatus = (status: string) => planStatusLabels[status] || 'Saved'

  const loadingId = ref<string | null>(null)
  const deletingId = ref<string | null>(null)
  const isModalOpen = ref(false)
  const isDeleteModalOpen = ref(false)
  const templateToDeleteId = ref<string | null>(null)
  const selectedTemplate = ref<any>(null)
  const startDate = ref(getUserLocalDate().toISOString().split('T')[0])
  const activating = ref(false)

  // Plan detail modal state
  const isPlanDetailOpen = ref(false)
  const selectedPlanDetail = ref<any>(null)
  const loadingPlanDetail = ref(false)

  // Pagination state for history
  const showAllHistory = ref(false)
  const currentHistoryPage = ref(1)
  const itemsPerPage = 10

  const paginatedHistory = computed(() => {
    if (!showAllHistory.value) {
      // Show only first 3 items by default
      return history.value.slice(0, 3)
    }

    // Show paginated items when "Show All" is clicked
    const start = (currentHistoryPage.value - 1) * itemsPerPage
    const end = start + itemsPerPage
    return history.value.slice(start, end)
  })

  const totalHistoryPages = computed(() => {
    return Math.ceil(history.value.length / itemsPerPage)
  })

  function nextPage() {
    if (currentHistoryPage.value < totalHistoryPages.value) {
      currentHistoryPage.value++
    }
  }

  function previousPage() {
    if (currentHistoryPage.value > 1) {
      currentHistoryPage.value--
    }
  }

  async function viewPlan(planId: string) {
    isPlanDetailOpen.value = true
    loadingPlanDetail.value = true
    selectedPlanDetail.value = null

    try {
      const data = await $fetch<any, string & {}>(`/api/plans/${planId}`)
      selectedPlanDetail.value = data
    } catch (error: any) {
      toast.add({
        title: 'Error',
        description: error.data?.message || error.message || 'Failed to load plan details',
        color: 'error'
      })
      isPlanDetailOpen.value = false
    } finally {
      loadingPlanDetail.value = false
    }
  }

  function useTemplate(plan: any) {
    selectedTemplate.value = plan
    isModalOpen.value = true
  }

  function useTemplateFromDetail() {
    if (selectedPlanDetail.value) {
      isPlanDetailOpen.value = false
      useTemplate(selectedPlanDetail.value)
    }
  }

  function deleteTemplate(id: string) {
    templateToDeleteId.value = id
    isDeleteModalOpen.value = true
  }

  async function executeDeleteTemplate() {
    if (!templateToDeleteId.value) return

    deletingId.value = templateToDeleteId.value
    try {
      await $fetch<any, string & {}>(`/api/plans/${templateToDeleteId.value}`, {
        method: 'DELETE'
      })

      toast.add({
        title: 'Success',
        description: 'Template deleted successfully.',
        color: 'success'
      })

      await refresh()
    } catch (error: any) {
      toast.add({
        title: 'Error',
        description: error.data?.message || error.message || 'Failed to delete template',
        color: 'error'
      })
    } finally {
      deletingId.value = null
      templateToDeleteId.value = null
      isDeleteModalOpen.value = false
    }
  }

  async function confirmUse() {
    if (!selectedTemplate.value) return

    activating.value = true
    try {
      const response = (await ($fetch as any)(`/api/plans/${selectedTemplate.value.id}/activate`, {
        method: 'POST',
        body: {
          startDate: new Date(startDate.value + 'T00:00:00').toISOString()
        }
      })) as { planId?: string }

      toast.add({
        title: 'Success',
        description: 'Training plan activated successfully.',
        color: 'success'
      })

      isModalOpen.value = false
      await refresh()

      // Redirect to the active plan page
      navigateTo('/plan')
    } catch (error: any) {
      toast.add({
        title: 'Error',
        description: error.data?.message || error.message || 'Failed to start plan',
        color: 'error'
      })
    } finally {
      activating.value = false
    }
  }

  function getTotalWeeks(plan: any) {
    if (!plan.blocks || plan.blocks.length === 0) return 0
    return plan.blocks.reduce((total: number, block: any) => {
      return total + (block._count?.weeks || 0)
    }, 0)
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'COMPLETED':
        return 'text-green-500'
      case 'ABANDONED':
        return 'text-red-500'
      case 'ARCHIVED':
        return 'text-gray-500'
      default:
        return 'text-gray-500'
    }
  }

  function formatDate(d: string | Date) {
    if (!d) return ''
    return baseFormatDate(d)
  }
</script>
