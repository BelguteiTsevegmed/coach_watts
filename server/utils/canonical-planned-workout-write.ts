import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { createError } from 'h3'
import { prisma } from './db'
import {
  buildRemoteStructureMergeFields,
  buildStructureEditFields,
  computeStructuredWorkoutHash
} from './planned-workout-structure-sync'
import { getPendingSyncStatus } from './structured-workout-persistence'
import { resolveWorkoutTargeting } from '../../trigger/utils/workout-targeting'
import {
  adaptStructuredWorkout,
  createZoneProfileSnapshot,
  validateStructuredWorkoutLimits,
  type StructureSource,
  type ZoneProfileSnapshot
} from '../../shared/structured-workout-contract'
import { validateCanonicalSemantics } from '../../shared/workout-canonical-validation'
import { summarizePlannedStimulus } from './training-stimulus'
import { validateFinalStructureDose } from './plans/structure-dose'
import { supersedeActiveStructureGenerationRuns } from './structure-generation-run'
import {
  lockPrescriptionSchedule,
  validatePrescriptionWrite,
  withPrescriptionAssessment
} from './training-prescription/service'

type WriteSource = Extract<
  StructureSource,
  'AI_GENERATION' | 'MANUAL_EDIT' | 'INTERVALS_IMPORT' | 'TEMPLATE' | 'LEGACY_ADAPTER'
>
type DbClient = Prisma.TransactionClient | typeof prisma

export type CanonicalWriteOptions = {
  source: WriteSource
  structure: unknown
  syncStatus?: string | null
  zoneProfileSnapshot?: ZoneProfileSnapshot
  refs?: { ftp: number; lthr: number; maxHr: number; thresholdPace: number }
  fallbackOrder?: Array<'power' | 'heartRate' | 'pace' | 'rpe'>
  preservePlannedDuration?: number | null
  workoutType?: string | null
  extra?: Record<string, unknown>
  /** Skip diagnostics rejection for message-only or partial envelope updates. */
  allowDiagnostics?: boolean
  incrementRevision?: boolean
}

function mapEditSource(source: WriteSource) {
  if (source === 'INTERVALS_IMPORT') return 'REMOTE_IMPORT' as const
  if (source === 'AI_GENERATION') return 'AI' as const
  return 'USER' as const
}

function resolveSportTargetingRefs(sportSettings?: any, userFtp?: number | null) {
  const { targetPolicy } = resolveWorkoutTargeting(sportSettings || {})
  return {
    refs: {
      ftp: Number(sportSettings?.ftp || userFtp || 0),
      lthr: Number(sportSettings?.lthr || 0),
      maxHr: Number(sportSettings?.maxHr || 0),
      thresholdPace: Number(sportSettings?.thresholdPace || 0)
    },
    fallbackOrder: targetPolicy.fallbackOrder as Array<'power' | 'heartRate' | 'pace' | 'rpe'>
  }
}

/** Builds the Prisma update payload for a canonical structure write. */
export function buildCanonicalPlannedWorkoutWriteData(options: CanonicalWriteOptions) {
  const canonical = adaptStructuredWorkout(options.structure, {
    source: options.source,
    zoneProfileSnapshot: options.zoneProfileSnapshot || createZoneProfileSnapshot({})
  })
  if (!canonical) throw createError({ statusCode: 400, message: 'Invalid structured workout' })
  const limitIssues = validateStructuredWorkoutLimits(canonical)
  const semanticIssues =
    options.source === 'AI_GENERATION' || options.source === 'MANUAL_EDIT'
      ? validateCanonicalSemantics(canonical)
      : []
  const issues = [
    ...limitIssues,
    ...semanticIssues,
    ...(options.allowDiagnostics ? [] : canonical.diagnostics || [])
  ]
  if (issues.length) {
    throw createError({ statusCode: 422, message: issues[0]!.message, data: { issues } })
  }
  const stimulus = summarizePlannedStimulus(
    {
      type: options.workoutType,
      durationSec: options.preservePlannedDuration,
      structuredWorkout: canonical
    },
    options.refs
  )
  const finalDuration = stimulus.durationSeconds || options.preservePlannedDuration || 0
  const editSource = mapEditSource(options.source)
  const data: Record<string, unknown> = {
    ...(options.extra || {}),
    ...buildStructureEditFields(canonical, editSource),
    ...(options.incrementRevision !== false ? { structureRevision: { increment: 1 } } : {}),
    durationSec:
      options.source === 'INTERVALS_IMPORT'
        ? options.preservePlannedDuration || finalDuration || undefined
        : finalDuration || options.preservePlannedDuration || undefined,
    distanceMeters: stimulus.distanceMeters,
    tss: stimulus.tss.value,
    workIntensity:
      stimulus.tss.value !== null && finalDuration > 0
        ? Number(Math.sqrt((36 * stimulus.tss.value) / finalDuration).toFixed(2))
        : null,
    syncStatus:
      options.source === 'INTERVALS_IMPORT' ? 'SYNCED' : getPendingSyncStatus(options.syncStatus),
    syncError: null,
    stimulusSummary: stimulus
  }
  return {
    canonical,
    metrics: {
      durationSec: data.durationSec,
      distanceMeters: data.distanceMeters,
      tss: data.tss,
      workIntensity: data.workIntensity,
      stimulus
    },
    data
  }
}

/** Canonical fields for accepted Intervals import create/update paths. */
export function buildRemoteImportAcceptedWriteData(options: {
  structure: unknown
  zoneProfileSnapshot?: ZoneProfileSnapshot
  sportSettings?: any
  workoutType?: string | null
  preservePlannedDuration?: number | null
  seenAt?: Date
  allowDiagnostics?: boolean
  incrementRevision?: boolean
}) {
  const { refs, fallbackOrder } = resolveSportTargetingRefs(options.sportSettings)
  const seenAt = options.seenAt || new Date()
  const result = buildCanonicalPlannedWorkoutWriteData({
    source: 'INTERVALS_IMPORT',
    structure: options.structure,
    zoneProfileSnapshot: options.zoneProfileSnapshot,
    refs,
    workoutType: options.workoutType,
    fallbackOrder,
    preservePlannedDuration: options.preservePlannedDuration,
    allowDiagnostics: options.allowDiagnostics ?? true,
    incrementRevision: options.incrementRevision ?? true,
    syncStatus: 'SYNCED',
    extra: { lastRemoteStructureSeenAt: seenAt }
  })
  return {
    ...result,
    data: {
      ...result.data,
      remoteStructureHash: computeStructuredWorkoutHash(result.canonical)
    }
  }
}

/** Canonical fields when scheduling/copying template workouts. */
export function buildTemplateStructureWriteData(options: {
  structure: unknown
  sportSettings?: any
  workoutType?: string | null
  preservePlannedDuration?: number | null
  allowDiagnostics?: boolean
  syncStatus?: string | null
}) {
  const { refs, fallbackOrder } = resolveSportTargetingRefs(options.sportSettings)
  return buildCanonicalPlannedWorkoutWriteData({
    source: 'TEMPLATE',
    structure: options.structure,
    zoneProfileSnapshot: createZoneProfileSnapshot(options.sportSettings || {}),
    refs,
    workoutType: options.workoutType,
    fallbackOrder,
    preservePlannedDuration: options.preservePlannedDuration,
    allowDiagnostics: options.allowDiagnostics ?? true,
    incrementRevision: false,
    syncStatus: options.syncStatus ?? 'LOCAL_ONLY'
  })
}

/** Canonical fields for legacy data restore imports. */
export function buildLegacyAdapterWriteData(options: {
  workoutType?: string | null
  structure: unknown
  preservePlannedDuration?: number | null
}) {
  return buildCanonicalPlannedWorkoutWriteData({
    source: 'LEGACY_ADAPTER',
    workoutType: options.workoutType,
    structure: options.structure,
    allowDiagnostics: true,
    incrementRevision: false,
    syncStatus: 'LOCAL_ONLY',
    preservePlannedDuration: options.preservePlannedDuration
  })
}

function stripDerivedMetricsForLocalConflict(updateData: Record<string, unknown>) {
  delete updateData.durationSec
  delete updateData.distanceMeters
  delete updateData.tss
  delete updateData.workIntensity
  delete updateData.stimulusSummary
}

/** Merge remote import payloads with local conflict rules and canonical accepted writes. */
export function buildIntervalsImportPersistenceFields(options: {
  existingRecord: any | null | undefined
  normalizedPlanned: Record<string, any>
  sportSettings: any
  seenAt: Date
}) {
  const { existingRecord, normalizedPlanned, sportSettings, seenAt } = options
  const newStruct = normalizedPlanned.structuredWorkout

  if (existingRecord) {
    const updateData: Record<string, any> = { ...normalizedPlanned }
    if (newStruct && typeof newStruct === 'object') {
      const remoteMerge = buildRemoteStructureMergeFields(existingRecord, newStruct, seenAt)
      if (remoteMerge.decision.accept) {
        const accepted = buildRemoteImportAcceptedWriteData({
          structure: newStruct,
          zoneProfileSnapshot: (newStruct as any).zoneProfileSnapshot,
          sportSettings,
          workoutType: normalizedPlanned.type,
          preservePlannedDuration: normalizedPlanned.durationSec ?? existingRecord.durationSec,
          seenAt
        })
        Object.assign(updateData, accepted.data)
        // Preserve the external provider's reported totals; the structure estimate is separate.
        for (const key of ['tss', 'distanceMeters'] as const)
          if (normalizedPlanned[key] != null) updateData[key] = normalizedPlanned[key]
      } else {
        if (!('structuredWorkout' in remoteMerge.fields)) {
          delete updateData.structuredWorkout
        }
        if (
          remoteMerge.decision.reason === 'local_modified' ||
          remoteMerge.decision.reason === 'local_unpublished_changes'
        ) {
          stripDerivedMetricsForLocalConflict(updateData)
        }
        Object.assign(updateData, remoteMerge.fields)
      }
    } else {
      updateData.lastRemoteStructureSeenAt = seenAt
    }
    return updateData
  }

  const createData: Record<string, any> = { ...normalizedPlanned }
  if (newStruct && typeof newStruct === 'object') {
    const accepted = buildRemoteImportAcceptedWriteData({
      structure: newStruct,
      zoneProfileSnapshot: (newStruct as any).zoneProfileSnapshot,
      sportSettings,
      workoutType: normalizedPlanned.type,
      preservePlannedDuration: normalizedPlanned.durationSec,
      seenAt,
      incrementRevision: false
    })
    Object.assign(createData, accepted.data)
    for (const key of ['tss', 'distanceMeters'] as const)
      if (normalizedPlanned[key] != null) createData[key] = normalizedPlanned[key]
  }
  return createData
}

/** Upsert Intervals planned workouts; avoids duplicate (userId, externalId) races. */
export async function persistIntervalsPlannedWorkoutImport(
  client: DbClient,
  options: {
    userId: string
    existingRecord: any | null | undefined
    normalizedPlanned: Record<string, any>
    sportSettings: any
    seenAt: Date
  }
): Promise<void> {
  if (client === prisma)
    return prisma.$transaction((tx) => persistIntervalsPlannedWorkoutImport(tx, options), {
      isolationLevel: 'Serializable'
    })
  const { userId, normalizedPlanned, sportSettings, seenAt } = options
  await lockPrescriptionSchedule(client, userId)
  const externalId = normalizedPlanned.externalId
  const existingRecord =
    options.existingRecord?.externalId !== externalId && options.existingRecord?.id
      ? await client.plannedWorkout.findUnique({ where: { id: options.existingRecord.id, userId } })
      : await client.plannedWorkout.findUnique({
          where: { userId_externalId: { userId, externalId } }
        })
  const id = existingRecord?.id || randomUUID()
  const assessment = await validatePrescriptionWrite(
    client,
    userId,
    [{ ...normalizedPlanned, id }],
    { source: 'intervals-import', imported: true }
  )
  const baseCreateData = buildIntervalsImportPersistenceFields({
    existingRecord: null,
    normalizedPlanned,
    sportSettings,
    seenAt
  }) as Prisma.PlannedWorkoutUncheckedCreateInput
  const createData = {
    ...baseCreateData,
    id,
    rawJson: withPrescriptionAssessment(normalizedPlanned.rawJson, assessment.id)
  } as Prisma.PlannedWorkoutUncheckedCreateInput
  const updateData = buildIntervalsImportPersistenceFields({
    existingRecord,
    normalizedPlanned,
    sportSettings,
    seenAt
  })
  updateData.rawJson = withPrescriptionAssessment(
    updateData.rawJson ?? existingRecord?.rawJson,
    assessment.id
  )
  if (existingRecord && existingRecord.externalId !== externalId) {
    await client.plannedWorkout.update({
      where: { id: existingRecord.id, userId },
      data: updateData
    })
    return
  }
  await client.plannedWorkout.upsert({
    where: { userId_externalId: { userId, externalId } },
    create: createData,
    update: updateData
  })
}

/**
 * Sole owner for planned-workout structure writes. The structure, derived metrics,
 * hash, revision, and sync intent are written together, optionally guarded by a
 * generation revision so late Trigger jobs cannot partially overwrite a newer edit.
 */
export async function writeCanonicalPlannedWorkoutStructure(
  options: CanonicalWriteOptions & {
    plannedWorkoutId: string
    expectedGenerationRevision?: number
    tx?: DbClient
  }
) {
  const persist = async (client: DbClient) => {
    const initial = await client.plannedWorkout.findUnique({
      where: { id: options.plannedWorkoutId }
    })
    if (!initial && options.expectedGenerationRevision !== undefined)
      return { ...buildCanonicalPlannedWorkoutWriteData(options), stale: true }
    if (!initial) throw createError({ statusCode: 404, message: 'Planned workout not found' })
    await lockPrescriptionSchedule(client, initial.userId)
    const existing = await client.plannedWorkout.findUnique({
      where: { id: options.plannedWorkoutId }
    })
    if (
      options.expectedGenerationRevision !== undefined &&
      existing &&
      existing.generationRevision !== options.expectedGenerationRevision
    ) {
      return { ...buildCanonicalPlannedWorkoutWriteData(options), stale: true }
    }
    const { canonical, metrics, data } = buildCanonicalPlannedWorkoutWriteData({
      ...options,
      workoutType: options.workoutType ?? existing?.type,
      preservePlannedDuration: options.preservePlannedDuration ?? existing?.durationSec
    })
    if (existing && options.source !== 'INTERVALS_IMPORT' && options.source !== 'LEGACY_ADAPTER')
      await validateFinalStructureDose(
        client,
        { ...existing, ...options.extra },
        Number(data.durationSec || 0),
        options.workoutType ?? existing.type,
        typeof data.tss === 'number' ? data.tss : null
      )
    if (existing && options.source !== 'LEGACY_ADAPTER') {
      const assessment = await validatePrescriptionWrite(
        client,
        existing.userId,
        [{ ...existing, ...data, type: options.workoutType ?? existing.type }],
        { source: `canonical-${options.source}`, imported: options.source === 'INTERVALS_IMPORT' }
      )
      data.rawJson = withPrescriptionAssessment(existing.rawJson, assessment.id)
    }
    if (options.source === 'MANUAL_EDIT' && options.incrementRevision !== false) {
      await supersedeActiveStructureGenerationRuns(options.plannedWorkoutId, client)
      ;(data as any).generationRevision = { increment: 1 }
    }
    if (options.expectedGenerationRevision !== undefined) {
      const result = await client.plannedWorkout.updateMany({
        where: {
          id: options.plannedWorkoutId,
          generationRevision: options.expectedGenerationRevision
        },
        data
      })
      return { canonical, metrics, stale: result.count === 0 }
    }
    const workout = await client.plannedWorkout.update({
      where: { id: options.plannedWorkoutId },
      data
    })
    return { canonical, metrics, stale: false, workout }
  }
  // A single transaction owns the dose check and structure/metric write.
  return options.tx
    ? persist(options.tx)
    : prisma.$transaction(persist, { isolationLevel: 'Serializable' })
}
