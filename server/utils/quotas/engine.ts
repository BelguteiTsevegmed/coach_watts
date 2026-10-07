import type { QuotaStatus } from '~~/app/types/quotas'
import { quotaFeatureCode } from './registry'

// Compatibility for existing task callers. Usage is still logged in LlmUsage,
// but this personal fork has no subscription allowances or quota enforcement.
export async function getQuotaStatus(
  _userId: string,
  _operation: string
): Promise<QuotaStatus | null> {
  return null
}

export async function checkQuota(_userId: string, operation: string): Promise<QuotaStatus> {
  return {
    operation,
    allowed: true,
    used: 0,
    limit: Infinity,
    remaining: Infinity,
    window: 'none',
    resetsAt: null,
    enforcement: 'MEASURE'
  }
}

export async function recordQuotaDenial(
  _userId: string,
  _operation: string,
  _status: Pick<QuotaStatus, 'used' | 'limit'>
): Promise<void> {}

export async function getQuotaSummary(_userId: string): Promise<QuotaStatus[]> {
  return []
}

/**
 * Seconds until the allowance refills, for the `Retry-After` header.
 * Null when the reset time is unknown or already in the past.
 */
export function quotaRetryAfterSeconds(
  resetsAt: Date | string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!resetsAt) return null
  const reset = new Date(resetsAt)
  if (Number.isNaN(reset.getTime())) return null
  const seconds = Math.ceil((reset.getTime() - now.getTime()) / 1000)
  return seconds > 0 ? seconds : null
}

/**
 * The 429 body contract shared with API clients: what was limited, how much of
 * the allowance was used, when it comes back, and which tier lifts it. Clients
 * must never have to parse English copy to build a plan-limit state.
 */
export function buildQuotaErrorPayload(status: QuotaStatus): Record<string, unknown> {
  const retryAfterSeconds = quotaRetryAfterSeconds(status.resetsAt)

  return {
    code: 'QUOTA_EXCEEDED',
    operation: status.operation,
    feature: quotaFeatureCode(status.operation),
    limit: status.limit,
    used: status.used,
    remaining: status.remaining,
    window: status.window,
    resetsAt: status.resetsAt instanceof Date ? status.resetsAt.toISOString() : status.resetsAt,
    retryAfterSeconds,
    requiredTier: status.nextTier ?? null,
    requiredTierLimit: status.nextTierLimit ?? null,
    // Retained for existing consumers that branch on this flag.
    quotaExceeded: true
  }
}
