import { resolvePhysiologyReferences } from './physiology-references'
import { normalizeWorkoutSport } from './workout-support-matrix'

export type SettingsStalenessReason =
  | 'profile_changed'
  | 'ftp_changed'
  | 'lthr_changed'
  | 'max_hr_changed'
  | 'threshold_pace_changed'
  | 'zones_changed'
  | 'reference_changed'

export type SettingsStaleness = {
  stale: boolean
  reasons: SettingsStalenessReason[]
  snapshotProfileId: string | null
  liveProfileId: string | null
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function zonesSignature(zones: unknown): string {
  if (!Array.isArray(zones)) return '[]'
  return JSON.stringify(
    zones.map((zone: any) => ({
      name: zone?.name || null,
      min: finiteNumber(zone?.min),
      max: finiteNumber(zone?.max)
    }))
  )
}

/** Compares the frozen generation snapshot against current sport settings. */
export function assessWorkoutSettingsStaleness(input: {
  workoutType?: string | null
  lastGenerationSettingsSnapshot?: unknown
  createdFromSettingsSnapshot?: unknown
  liveSportSettings?: any | null
  liveUserFtp?: number | null
}): SettingsStaleness {
  const snapshot = (input.lastGenerationSettingsSnapshot ||
    input.createdFromSettingsSnapshot ||
    null) as any
  if (!snapshot || !input.liveSportSettings) {
    return {
      stale: false,
      reasons: [],
      snapshotProfileId: snapshot?.profile?.id || null,
      liveProfileId: input.liveSportSettings?.id || null
    }
  }

  const reasons: SettingsStalenessReason[] = []
  const sport = normalizeWorkoutSport(input.workoutType)
  const snapshotProfileId = snapshot?.profile?.id || null
  const liveProfileId = input.liveSportSettings?.id || null
  if ((snapshotProfileId || liveProfileId) && snapshotProfileId !== liveProfileId) {
    reasons.push('profile_changed')
  }

  const snapshotThresholds = snapshot?.thresholds || {}
  const snapshotFtp = finiteNumber(snapshotThresholds.ftp)
  const resolution = resolvePhysiologyReferences({
    workoutType: input.workoutType,
    sportSettings: input.liveSportSettings,
    user: { ftp: input.liveUserFtp }
  })
  const liveFtp = finiteNumber(resolution.refs.ftp)
  if (
    (snapshotFtp === null) !== (liveFtp === null) ||
    (snapshotFtp !== null && liveFtp !== null && Math.abs(snapshotFtp - liveFtp) >= 1)
  ) {
    reasons.push('ftp_changed')
  }

  const snapshotLthr = finiteNumber(snapshotThresholds.lthr)
  const liveLthr = finiteNumber(resolution.refs.lthr)
  if (
    (snapshotLthr === null) !== (liveLthr === null) ||
    (snapshotLthr !== null && liveLthr !== null && Math.abs(snapshotLthr - liveLthr) >= 1)
  ) {
    reasons.push('lthr_changed')
  }

  const snapshotThresholdPace = finiteNumber(snapshotThresholds.thresholdPace)
  const liveThresholdPace = finiteNumber(resolution.refs.thresholdPace)
  if (
    (snapshotThresholdPace === null) !== (liveThresholdPace === null) ||
    (snapshotThresholdPace !== null &&
      liveThresholdPace !== null &&
      Math.abs(snapshotThresholdPace - liveThresholdPace) > 0.01)
  ) {
    reasons.push('threshold_pace_changed')
  }

  const frozenMaxHr = finiteNumber(snapshotThresholds.maxHr)
  const liveMaxHr = finiteNumber(resolution.refs.maxHr)
  if (
    (frozenMaxHr === null) !== (liveMaxHr === null) ||
    (frozenMaxHr !== null && liveMaxHr !== null && Math.abs(frozenMaxHr - liveMaxHr) >= 1)
  )
    reasons.push('max_hr_changed')
  if (
    snapshot.physiology &&
    JSON.stringify(snapshot.physiology.references) !== JSON.stringify(resolution.references)
  )
    reasons.push('reference_changed')

  const snapshotZones = snapshot?.zones || {}
  if (sport === 'run' || sport === 'swim') {
    if (zonesSignature(snapshotZones.pace) !== zonesSignature(input.liveSportSettings?.paceZones)) {
      reasons.push('zones_changed')
    }
  } else if (sport === 'ride') {
    if (
      zonesSignature(snapshotZones.power) !== zonesSignature(input.liveSportSettings?.powerZones)
    ) {
      reasons.push('zones_changed')
    }
  } else if (
    zonesSignature(snapshotZones.heartRate) !== zonesSignature(input.liveSportSettings?.hrZones)
  ) {
    reasons.push('zones_changed')
  }

  return {
    stale: reasons.length > 0,
    reasons,
    snapshotProfileId,
    liveProfileId
  }
}
