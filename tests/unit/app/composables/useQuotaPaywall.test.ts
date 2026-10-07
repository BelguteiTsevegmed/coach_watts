// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { useQuotaPaywall } from '../../../../app/composables/useQuotaPaywall'

describe('Unrestricted feature controls', () => {
  it('runs the action without fetching subscription or quota data', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('No billing service'))
    vi.stubGlobal('$fetch', fetch)
    let executed = false
    const access = useQuotaPaywall()
    await access.handleLockedAction({
      operation: 'daily_checkin',
      featureTitle: 'Check-in',
      onAllowed: () => {
        executed = true
      }
    })
    expect(executed).toBe(true)
    expect(access.useOperationLockState('daily_checkin').locked.value).toBe(false)
    expect(access.useOperationLockState('daily_checkin').remainingLabel.value).toBeNull()
    expect(access.shouldShowQuotaMeterForUser()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('ignores historical exhausted quotas', () => {
    expect(useQuotaPaywall().isQuotaExhausted({ remaining: 0, allowed: false } as any)).toBe(false)
  })
})
