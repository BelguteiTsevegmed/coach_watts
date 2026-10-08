import { createError, defineEventHandler, readBody } from 'h3'
import { requireAuth } from '../../utils/auth-guard'
import { dailyCheckinRepository } from '../../utils/repositories/dailyCheckinRepository'
import { getUserTimezone, getUserLocalDate } from '../../utils/date'
import { dispatchTask, getTaskDriver } from '../../utils/task-dispatcher'
import { mainTaskQueue } from '../../utils/queue'
import { publishTaskRunStartedEvent } from '../../utils/task-run-events'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, ['health:write'])
  const userId = user.id
  const timezone = await getUserTimezone(userId)
  const today = getUserLocalDate(timezone)
  const checkin = await dailyCheckinRepository.getByDate(userId, today)
  const body = await readBody(event).catch(() => ({}))
  const force = body?.force === true
  const isStuck =
    checkin &&
    ['PENDING', 'PROCESSING'].includes(checkin.status) &&
    Date.now() - checkin.updatedAt.getTime() > 5 * 60 * 1000

  if (checkin && !force && !isStuck && checkin.status !== 'FAILED') return checkin

  if (getTaskDriver() === 'redis') {
    const workers = await mainTaskQueue.getWorkers().catch((cause) => {
      throw createError({
        statusCode: 503,
        message: 'The check-in service is temporarily unavailable. Please try again shortly.',
        cause
      })
    })
    if (workers.length === 0) {
      throw createError({
        statusCode: 503,
        message: 'The background worker is offline. Start pnpm dev:worker, then try again.'
      })
    }
  }

  // Persist before enqueueing so polling can always observe progress or failure.
  // Upsert also protects simultaneous first requests from a unique-key race.
  const pending = checkin || (await dailyCheckinRepository.ensurePending(userId, today))
  if (checkin) await dailyCheckinRepository.update(pending.id, { status: 'PENDING' })
  const idempotencyKey =
    checkin && (force || isStuck || checkin.status === 'FAILED')
      ? `${userId}-${today.getTime()}-${Date.now()}`
      : `${userId}-${today.getTime()}`

  let handle: { id: string }
  try {
    handle = await dispatchTask(
      'generate-daily-checkin',
      { userId, date: today, checkinId: pending.id, source: 'user', force },
      { idempotencyKey, concurrencyKey: userId, tags: [`user:${userId}`] }
    )
  } catch (error) {
    await dailyCheckinRepository.update(pending.id, { status: 'FAILED' })
    throw error
  }
  await publishTaskRunStartedEvent(userId, 'generate-daily-checkin', handle)
  return { ...pending, status: 'PENDING' }
})
