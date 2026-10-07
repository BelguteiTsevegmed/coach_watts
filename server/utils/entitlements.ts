export interface UserEntitlements {
  tier: 'FREE' | 'SUPPORTER' | 'PRO'
  autoSync: boolean
  autoAnalysis: boolean
  aiModel: 'flash' | 'pro'
  priorityProcessing: boolean
  proactivity: boolean
}

/** All coaching features are available in this personal fork. */
export function getUserEntitlements(_user?: unknown): UserEntitlements {
  return {
    tier: 'PRO',
    autoSync: true,
    autoAnalysis: true,
    aiModel: 'pro',
    priorityProcessing: true,
    proactivity: true
  }
}
