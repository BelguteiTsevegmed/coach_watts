import {
  lockPrescriptionSchedule,
  validatePrescriptionWrite,
  withPrescriptionAssessment
} from './training-prescription/service'
import { prisma } from './db'
import { normalizeIntervalsSportType, isIntervalsEventId } from './intervals'
import { syncPlannedWorkoutToIntervals } from './intervals-sync'
import { plannedWorkoutRepository } from './repositories/plannedWorkoutRepository'
import { metabolicService } from './services/metabolicService'
import { isNutritionTrackingEnabled } from './nutrition/feature'
import { sportSettingsRepository } from './repositories/sportSettingsRepository'
import { createZoneProfileSnapshot } from '../../shared/structured-workout-contract'
import { serializeCanonicalForIntervals } from './canonical-workout-serializer'
import { buildExportOptionsFromPlannedWorkout } from './workout-export-settings'
import {
  buildCanonicalPlannedWorkoutWriteData,
  writeCanonicalPlannedWorkoutStructure
} from './canonical-planned-workout-write'
import { resolveWorkoutTargeting } from '../../trigger/utils/workout-targeting'

export function normalizePlannedWorkoutDate(value: string | Date) {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (match) {
      const [, year, month, day] = match
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    }
  }

  const rawDate = new Date(value)
  return new Date(Date.UTC(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate()))
}

async function buildWorkoutDoc(userId: string, workout: any, body: any) {
  const structuredWorkout = body?.structuredWorkout ?? workout?.structuredWorkout
  if (!structuredWorkout) return ''

  const intervalsType = normalizeIntervalsSportType(body?.type || workout?.type || 'Ride')
  const sportSettings = await sportSettingsRepository.getForActivityType(userId, intervalsType)

  return serializeCanonicalForIntervals({
    ...buildExportOptionsFromPlannedWorkout(
      {
        title: body?.title || workout?.title || 'Workout',
        description: body?.description ?? workout?.description ?? '',
        type: intervalsType,
        structuredWorkout,
        lastGenerationSettingsSnapshot: workout?.lastGenerationSettingsSnapshot,
        createdFromSettingsSnapshot: workout?.createdFromSettingsSnapshot,
        user: {
          ftp: (await prisma.user.findUnique({ where: { id: userId }, select: { ftp: true } }))?.ftp
        }
      },
      sportSettings
    ),
    structure: structuredWorkout
  })
}

async function getPlannedWorkoutSyncSettings(userId: string) {
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: 'intervals' }
  })
  const settings = (integration?.settings as any) || {}
  return {
    integration,
    importPlannedWorkouts: settings.importPlannedWorkouts !== false
  }
}

export async function createPlannedWorkoutForUser(userId: string, body: any) {
  if (!body.date || !body.title) {
    throw createError({ statusCode: 400, message: 'Date and title are required' })
  }

  const forcedDate = normalizePlannedWorkoutDate(body.date)
  const structureSettings = body.structuredWorkout
    ? await sportSettingsRepository.getForActivityType(userId, body.type || 'Ride')
    : null
  const structureWrite = body.structuredWorkout
    ? buildCanonicalPlannedWorkoutWriteData({
        source: 'MANUAL_EDIT',
        workoutType: body.type || 'Ride',
        structure: body.structuredWorkout,
        zoneProfileSnapshot: createZoneProfileSnapshot(structureSettings),
        syncStatus: 'LOCAL_ONLY',
        refs: {
          ftp: Number(structureSettings?.ftp || 0),
          lthr: Number(structureSettings?.lthr || 0),
          maxHr: Number(structureSettings?.maxHr || 0),
          thresholdPace: Number(structureSettings?.thresholdPace || 0)
        },
        fallbackOrder: resolveWorkoutTargeting(structureSettings).targetPolicy
          .fallbackOrder as Array<'power' | 'heartRate' | 'pace' | 'rpe'>,
        preservePlannedDuration: body.durationSec,
        incrementRevision: false
      })
    : null
  if (structureWrite?.canonical?.diagnostics?.length) {
    throw createError({
      statusCode: 422,
      message: 'Structured workout has unresolved targets.',
      data: { diagnostics: structureWrite.canonical.diagnostics }
    })
  }
  if (body.structuredWorkout && !structureWrite?.canonical) {
    throw createError({ statusCode: 400, message: 'Invalid structured workout' })
  }
  body = {
    ...body,
    ...(structureWrite ? structureWrite.data : {})
  }
  const workoutDoc = await buildWorkoutDoc(userId, null, body)
  const { integration, importPlannedWorkouts } = await getPlannedWorkoutSyncSettings(userId)

  const externalId = `adhoc-${Date.now()}`
  const syncStatus = 'LOCAL_ONLY'

  let plannedWorkout = await plannedWorkoutRepository.create({
    userId,
    externalId,
    date: forcedDate,
    startTime: body.startTime,
    title: body.title,
    description: body.description || '',
    type: body.type || 'Ride',
    category: body.category,
    durationSec: body.durationSec ?? (body.type === 'Rest' ? 0 : 3600),
    distanceMeters: body.distanceMeters,
    tss: body.tss,
    workIntensity: body.workIntensity,
    fuelingStrategy: body.fuelingStrategy || 'STANDARD',
    completed: false,
    syncStatus,
    managedBy: 'USER',
    ...(typeof body.trainingWeekId === 'string' && body.trainingWeekId
      ? { trainingWeekId: body.trainingWeekId }
      : {}),
    ...(structureWrite ? structureWrite.data : {}),
    rawJson: {}
  })

  if (integration && importPlannedWorkouts) {
    const synced = await syncPlannedWorkoutToIntervals(
      'CREATE',
      { ...plannedWorkout, workout_doc: workoutDoc || undefined },
      userId
    )
    plannedWorkout = await plannedWorkoutRepository.update(plannedWorkout.id, userId, {
      syncStatus: synced.synced ? 'SYNCED' : 'PENDING',
      syncError: synced.error || null,
      ...(synced.synced && synced.result?.id
        ? { externalId: String(synced.result.id), lastSyncedAt: new Date() }
        : {})
    })
  }

  try {
    if (await isNutritionTrackingEnabled(userId)) {
      await metabolicService.calculateFuelingPlanForDate(userId, forcedDate, { persist: true })
    }
  } catch (err) {
    console.error('[PlannedWorkoutCreate] Failed to trigger regeneration:', err)
  }

  return {
    success: true,
    workout: plannedWorkout
  }
}

export async function updatePlannedWorkoutForUser(userId: string, workoutId: string, body: any) {
  const existing = await plannedWorkoutRepository.getById(workoutId, userId)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  const forcedDate = body.date ? normalizePlannedWorkoutDate(body.date) : undefined
  const { importPlannedWorkouts } = await getPlannedWorkoutSyncSettings(userId)
  const structureSettings =
    body.structuredWorkout !== undefined
      ? await sportSettingsRepository.getForActivityType(
          userId,
          body.type || existing.type || 'Ride'
        )
      : null
  const { targetPolicy } = resolveWorkoutTargeting(structureSettings || {})
  const refs = {
    ftp: Number(structureSettings?.ftp || 0),
    lthr: Number(structureSettings?.lthr || 0),
    maxHr: Number(structureSettings?.maxHr || 0),
    thresholdPace: Number(structureSettings?.thresholdPace || 0)
  }

  // Content edits (not date-only moves) re-tag AI-managed sessions as athlete-owned
  // so RECALCULATE_WEEK / plan cleanup preserve them instead of silently deleting.
  const isContentEdit =
    body.title !== undefined ||
    body.description !== undefined ||
    body.type !== undefined ||
    body.durationSec !== undefined ||
    body.duration_minutes !== undefined ||
    body.tss !== undefined ||
    body.workIntensity !== undefined ||
    body.fuelingStrategy !== undefined ||
    body.structuredWorkout !== undefined ||
    body.startTime !== undefined

  const editData = {
    ...(forcedDate && { date: forcedDate }),
    ...(body.title && { title: body.title }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.type && { type: body.type }),
    ...(body.startTime !== undefined && { startTime: body.startTime }),
    ...(body.durationSec && !body.structuredWorkout && { durationSec: body.durationSec }),
    ...(body.duration_minutes &&
      !body.structuredWorkout && { durationSec: body.duration_minutes * 60 }),
    ...(body.tss !== undefined && !body.structuredWorkout && { tss: body.tss }),
    ...(body.workIntensity !== undefined &&
      !body.structuredWorkout && { workIntensity: body.workIntensity }),
    ...(body.fuelingStrategy !== undefined && { fuelingStrategy: body.fuelingStrategy }),
    modifiedLocally: true,
    ...(isContentEdit && existing.managedBy !== 'USER' ? { managedBy: 'USER' } : {}),
    ...(importPlannedWorkouts && !body.structuredWorkout && { syncStatus: 'PENDING' })
  }

  let updated: any
  if (body.structuredWorkout !== undefined) {
    const write = await writeCanonicalPlannedWorkoutStructure({
      plannedWorkoutId: workoutId,
      source: 'MANUAL_EDIT',
      extra: editData,
      workoutType: body.type || existing.type,
      structure: body.structuredWorkout,
      zoneProfileSnapshot:
        (existing.structuredWorkout as any)?.zoneProfileSnapshot ||
        createZoneProfileSnapshot(structureSettings),
      syncStatus: importPlannedWorkouts ? 'PENDING' : existing.syncStatus,
      refs,
      fallbackOrder: targetPolicy.fallbackOrder as Array<'power' | 'heartRate' | 'pace' | 'rpe'>,
      preservePlannedDuration:
        body.durationSec || body.duration_minutes
          ? body.duration_minutes
            ? body.duration_minutes * 60
            : body.durationSec
          : existing.durationSec
    })
    updated = write.workout
  } else {
    updated = await plannedWorkoutRepository.update(workoutId, userId, editData)
  }

  try {
    if (await isNutritionTrackingEnabled(userId)) {
      await metabolicService.calculateFuelingPlanForDate(userId, forcedDate || updated.date, {
        persist: true
      })
    }
  } catch (err) {
    console.error('[PlannedWorkoutUpdate] Failed to trigger regeneration:', err)
  }

  const isLocal = existing.syncStatus === 'LOCAL_ONLY' || !isIntervalsEventId(existing.externalId)
  const workoutDoc = await buildWorkoutDoc(userId, updated, body)

  if (importPlannedWorkouts) {
    const syncResult = await syncPlannedWorkoutToIntervals(
      isLocal ? 'CREATE' : 'UPDATE',
      {
        id: updated.id,
        structureRevision: updated.structureRevision,
        externalId: updated.externalId,
        date: updated.date,
        startTime: updated.startTime,
        title: updated.title,
        description: updated.description,
        type: updated.type,
        durationSec: updated.durationSec,
        tss: updated.tss,
        workout_doc: workoutDoc,
        managedBy: updated.managedBy
      },
      userId
    )

    const finalWorkout = await plannedWorkoutRepository.update(workoutId, userId, {
      syncStatus: syncResult.synced ? 'SYNCED' : 'PENDING',
      lastSyncedAt: syncResult.synced ? new Date() : undefined,
      syncError: syncResult.error || null,
      ...(syncResult.synced &&
        syncResult.result?.id && {
          externalId: String(syncResult.result.id)
        })
    })

    return {
      success: true,
      workout: finalWorkout,
      syncStatus: syncResult.synced ? 'synced' : 'pending',
      message: syncResult.message || 'Workout updated successfully'
    }
  }

  return {
    success: true,
    workout: updated,
    syncStatus: 'local',
    message: 'Workout updated locally (sync disabled)'
  }
}

export async function deletePlannedWorkoutForUser(userId: string, workoutId: string) {
  const workout = await plannedWorkoutRepository.getById(workoutId, userId)
  if (!workout) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  await plannedWorkoutRepository.delete(workoutId, userId)

  try {
    if (await isNutritionTrackingEnabled(userId)) {
      await metabolicService.calculateFuelingPlanForDate(userId, workout.date, { persist: true })
    }
  } catch (err) {
    console.error('[PlannedWorkoutDelete] Failed to trigger regeneration:', err)
  }

  return {
    success: true,
    message: 'Workout deleted successfully'
  }
}

export async function movePlannedWorkoutForUser(
  userId: string,
  workoutId: string,
  targetDateInput: string
) {
  const sourceWorkout = await prisma.plannedWorkout.findUnique({
    where: { id: workoutId }
  })

  if (!sourceWorkout || sourceWorkout.userId !== userId) {
    throw createError({ statusCode: 404, message: 'Workout not found' })
  }

  const targetDate = normalizePlannedWorkoutDate(targetDateInput)
  const conflictingWorkout = await prisma.plannedWorkout.findFirst({
    where: {
      userId,
      date: targetDate,
      id: { not: workoutId }
    }
  })

  await prisma.$transaction(
    async (tx) => {
      await lockPrescriptionSchedule(tx, userId)
      const currentSource = await tx.plannedWorkout.findUniqueOrThrow({
        where: { id: workoutId, userId }
      })
      const currentConflict = await tx.plannedWorkout.findFirst({
        where: { userId, date: targetDate, id: { not: workoutId } }
      })
      if (
        currentSource.updatedAt.getTime() !== sourceWorkout.updatedAt.getTime() ||
        currentConflict?.id !== conflictingWorkout?.id
      )
        throw createError({
          statusCode: 409,
          message: 'The schedule changed before this move. Reload and try again.'
        })
      const proposals = [
        { ...currentSource, date: targetDate },
        ...(currentConflict ? [{ ...currentConflict, date: currentSource.date }] : [])
      ]
      const assessment = await validatePrescriptionWrite(tx, userId, proposals, {
        source: 'calendar-move'
      })
      if (conflictingWorkout) {
        await tx.plannedWorkout.update({
          where: { id: conflictingWorkout.id },
          data: {
            date: sourceWorkout.date,
            rawJson: withPrescriptionAssessment(conflictingWorkout.rawJson, assessment.id)
          }
        })
      }

      await tx.plannedWorkout.update({
        where: { id: workoutId },
        data: {
          date: targetDate,
          rawJson: withPrescriptionAssessment(sourceWorkout.rawJson, assessment.id)
        }
      })
    },
    { isolationLevel: 'Serializable' }
  )

  return { success: true }
}
