import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { formatUserDate, getStartOfLocalDateUTC, getEndOfLocalDateUTC } from '../date'
import { resolveReadiness, formatReadinessForPrompt } from '../../../shared/readiness'

/** asOf is an athlete calendar date (@db.Date), never the proposed future session date. */
export async function getReadinessContext(
  userId: string,
  asOf: Date,
  db: Prisma.TransactionClient = prisma,
  timezone = 'UTC'
) {
  const date = new Date(`${asOf.toISOString().slice(0, 10)}T00:00:00Z`)
  const start = new Date(date.getTime() - 30 * 86400000)
  const recentStart = new Date(date.getTime() - 2 * 86400000)
  const [wellness, checkins, events, injuries, completed] = await Promise.all([
    db.wellness.findMany({
      where: { userId, date: { gte: start, lte: date } },
      orderBy: { date: 'desc' }
    }),
    db.dailyCheckin.findMany({
      where: { userId, status: 'COMPLETED', date: { gte: recentStart, lte: date } },
      orderBy: { date: 'desc' }
    }),
    db.calendarNote.findMany({
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      where: {
        userId,
        startDate: { lte: date },
        OR: [{ endDate: { gte: date } }, { endDate: null, startDate: date }]
      }
    }),
    db.injury.findMany({
      orderBy: [{ onsetDate: 'desc' }, { id: 'asc' }],
      where: { userId, status: { in: ['ACTIVE', 'RECOVERING'] }, onsetDate: { lte: date } }
    }),
    db.workout.findMany({
      where: {
        userId,
        isDuplicate: false,
        date: {
          gte: getStartOfLocalDateUTC(
            timezone,
            new Date(date.getTime() - 6 * 86400000).toISOString().slice(0, 10)
          ),
          lte: getEndOfLocalDateUTC(timezone, date.toISOString().slice(0, 10))
        }
      },
      select: { id: true, date: true, type: true, durationSec: true, tss: true },
      orderBy: { date: 'asc' }
    })
  ])
  const latestLoad = wellness.find((row) => row.ctl != null || row.atl != null || row.tsb != null)
  const context = resolveReadiness({
    asOf: date,
    wellness,
    checkins,
    events,
    injuries,
    load: {
      ctl: latestLoad?.ctl ?? null,
      atl: latestLoad?.atl ?? null,
      tsb: latestLoad?.tsb ?? null
    }
  })
  return {
    ...context,
    timezone,
    loadDate: latestLoad ? latestLoad.date.toISOString().slice(0, 10) : null,
    recentCompletedLoad: completed.map((workout) => ({
      ...workout,
      date: formatUserDate(workout.date, timezone, 'yyyy-MM-dd')
    }))
  }
}
export async function buildReadinessContext(userId: string, asOf: Date, timezone = 'UTC') {
  const context = await getReadinessContext(userId, asOf, prisma, timezone)
  return { context, prompt: formatReadinessForPrompt(context) }
}
