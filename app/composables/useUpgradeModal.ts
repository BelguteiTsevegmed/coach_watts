import type { PricingTier } from '~/utils/pricing'

interface UpgradeModalOptions {
  title?: string
  feature?: string
  featureTitle?: string
  featureDescription?: string
  bullets?: string[]
  recommendedTier?: PricingTier
  reason?: string
  quotaResetLabel?: string
  operation?: string
}

// Legacy callers may still ask to show an upgrade dialog. There is no paywall.
export function useUpgradeModal() {
  return {
    isOpen: ref(false),
    options: ref<UpgradeModalOptions>({}),
    show: (_options?: UpgradeModalOptions) => {},
    close: () => {}
  }
}
