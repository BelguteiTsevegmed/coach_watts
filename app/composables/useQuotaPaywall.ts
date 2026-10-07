import type { PricingTier } from '~/utils/pricing'
import type { QuotaStatus } from '~/types/quotas'
import type { SubscriptionTier } from '@prisma/client'
import type { QuotaPaywallOperation } from '~~/shared/quota-paywall'

interface QuotaSummaryResponse {
  tier: SubscriptionTier
  effectiveTier: SubscriptionTier
  isTrialActive: boolean
  showQuotaMeter: boolean
  trialEndsAt: Date | string | null
  quotas: QuotaStatus[]
}

export interface QuotaPaywallOptions {
  operation?: QuotaPaywallOperation
  title?: string
  featureTitle: string
  featureDescription?: string
  recommendedTier?: PricingTier
  bullets?: string[]
  reason?: string
  quota?: QuotaStatus | null
  quotaResetLabel?: string
}

// Compatibility for existing feature controls; every action is available.
export function useQuotaPaywall() {
  const quotaSummary = computed(() => null)
  const summary: QuotaSummaryResponse = {
    tier: 'PRO',
    effectiveTier: 'PRO',
    isTrialActive: false,
    showQuotaMeter: false,
    trialEndsAt: null,
    quotas: []
  }
  return {
    quotaSummary,
    ensureQuotasLoaded: async (_options?: { force?: boolean }) => summary,
    getOperationQuota: async (_operation: string): Promise<QuotaStatus | null> => null,
    getQuotaForOperation: (
      _operation: string,
      _quotas?: QuotaStatus[] | null
    ): QuotaStatus | null => null,
    isQuotaExhausted: (_quota?: QuotaStatus | null, _now?: Date) => false,
    shouldShowQuotaMeterForUser: () => false,
    showQuotaPaywall: async (_input: QuotaPaywallOptions) => {},
    buildPaywallOptions: (input: QuotaPaywallOptions) => input,
    handleLockedAction: async (params: {
      operation: QuotaPaywallOperation
      featureTitle: string
      onAllowed: () => void | Promise<void>
    }) => {
      await params.onAllowed()
    },
    useOperationLockState: (_operation: QuotaPaywallOperation) => ({
      locked: computed(() => false),
      lockedTierLabel: computed(() => ''),
      remaining: computed<number | null>(() => null),
      remainingLabel: computed<string | null>(() => null)
    })
  }
}
