import { requireAuth } from '../../utils/auth-guard'

// Compatibility for clients that still request quota summaries.
export default defineEventHandler(async (event) => {
  await requireAuth(event, ['profile:read'])
  return {
    tier: 'PRO',
    effectiveTier: 'PRO',
    isTrialActive: false,
    showQuotaMeter: false,
    trialEndsAt: null,
    quotas: []
  }
})
