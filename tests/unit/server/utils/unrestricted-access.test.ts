import { describe, expect, it, vi } from 'vitest'
import { getUserEntitlements } from '../../../../server/utils/entitlements'
import { checkQuota, getQuotaSummary } from '../../../../server/utils/quotas/engine'

vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        subscriptionTier: 'FREE',
        subscriptionStatus: 'NONE',
        subscriptionPeriodEnd: null,
        timezone: 'UTC'
      })
    },
    $queryRaw: vi.fn().mockResolvedValue([{ count: 1000 }]),
    quotaDenial: { create: vi.fn() }
  }
}))

describe('Personal fork access', () => {
  it('enables every feature without a subscription even with legacy Stripe configuration', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ stripeSecretKey: 'legacy-config' }))
    expect(
      getUserEntitlements({
        subscriptionTier: 'FREE',
        subscriptionStatus: 'NONE',
        subscriptionPeriodEnd: null
      })
    ).toEqual({
      tier: 'PRO',
      autoSync: true,
      autoAnalysis: true,
      aiModel: 'pro',
      priorityProcessing: true,
      proactivity: true
    })
  })

  it('allows daily check-ins after any amount of prior usage', async () => {
    await expect(checkQuota('user-123', 'daily_checkin')).resolves.toMatchObject({
      allowed: true,
      enforcement: 'MEASURE',
      window: 'none'
    })
  })

  it('does not expose subscription usage limits', async () => {
    await expect(getQuotaSummary('user-123')).resolves.toEqual([])
  })
})
