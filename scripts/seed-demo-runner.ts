import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Seeds ~6 weeks of realistic running history, wellness, a goal and the coming
// week of planned sessions for the dev user (AUTH_BYPASS_USER), so the athlete
// experience can be looked at locally without connecting Strava/Garmin.
// Idempotent: re-running replaces the previously seeded demo rows.
//
//   pnpm exec tsx scripts/seed-demo-runner.ts

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const SOURCE = 'demo'
const DAY = 86_400_000

function utcDay(offsetDays: number) {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return new Date(d.getTime() + offsetDays * DAY)
}

type RunTemplate = {
  title: string
  type: string
  minutes: number
  paceSecPerKm: number
  avgHr: number
  rpe: number
  intensity: number
}

const EASY: RunTemplate = {
  title: 'Easy Run',
  type: 'Run',
  minutes: 40,
  paceSecPerKm: 360,
  avgHr: 138,
  rpe: 3,
  intensity: 0.7
}
const TEMPO: RunTemplate = {
  title: 'Tempo Run',
  type: 'Run',
  minutes: 50,
  paceSecPerKm: 300,
  avgHr: 158,
  rpe: 6,
  intensity: 0.86
}
const INTERVALS: RunTemplate = {
  title: '6 x 800m Intervals',
  type: 'Run',
  minutes: 55,
  paceSecPerKm: 315,
  avgHr: 155,
  rpe: 7,
  intensity: 0.88
}
const LONG: RunTemplate = {
  title: 'Long Run',
  type: 'Run',
  minutes: 90,
  paceSecPerKm: 370,
  avgHr: 142,
  rpe: 4,
  intensity: 0.74
}
const STRENGTH: RunTemplate = {
  title: 'Strength & Mobility',
  type: 'WeightTraining',
  minutes: 35,
  paceSecPerKm: 0,
  avgHr: 110,
  rpe: 5,
  intensity: 0.55
}

// Mon..Sun pattern; null = rest
const WEEK: Array<RunTemplate | null> = [null, EASY, INTERVALS, STRENGTH, EASY, null, LONG]

async function main() {
  const email = process.env.AUTH_BYPASS_USER || 'dev@coachwatts.test'
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error(`User ${email} not found — run scripts/seed-dev-user.ts first`)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: user.name || 'Demo Runner',
      nickname: user.nickname || 'Alex',
      maxHr: 188,
      lthr: 168,
      restingHr: 52,
      weight: 70
    }
  })

  await prisma.workout.deleteMany({ where: { userId: user.id, source: SOURCE } })
  await prisma.plannedWorkout.deleteMany({
    where: { userId: user.id, externalId: { startsWith: 'demo-' } }
  })

  // History: 42 days back to yesterday, progressive load with a down week.
  let ctl = 28
  let atl = 30
  const workouts = []
  for (let offset = -42; offset <= -1; offset++) {
    const date = utcDay(offset)
    const weekday = (date.getUTCDay() + 6) % 7 // Mon=0
    const weekIdx = Math.floor((offset + 42) / 7)
    const template = WEEK[weekday]
    if (template) {
      const progression = weekIdx === 3 ? 0.75 : 1 + weekIdx * 0.05
      const minutes = Math.round(template.minutes * progression)
      const durationSec = minutes * 60
      const tss = Math.round((durationSec / 3600) * template.intensity * template.intensity * 100)
      const distanceMeters = template.paceSecPerKm
        ? Math.round((durationSec / template.paceSecPerKm) * 1000)
        : null
      ctl = ctl + (tss - ctl) / 42
      atl = atl + (tss - atl) / 7
      date.setUTCHours(6, 30)
      workouts.push({
        userId: user.id,
        externalId: `demo-${offset}`,
        source: SOURCE,
        date,
        title: template.title,
        type: template.type,
        durationSec,
        distanceMeters,
        averageHr: template.avgHr + Math.round(Math.random() * 4 - 2),
        maxHr: template.avgHr + 18,
        averageSpeed: distanceMeters ? distanceMeters / durationSec : null,
        tss,
        trainingLoad: tss,
        intensity: template.intensity,
        rpe: template.rpe,
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10
      })
    } else {
      ctl = ctl + (0 - ctl) / 42
      atl = atl + (0 - atl) / 7
    }

    const hrv = 62 + Math.round(Math.sin(offset / 3) * 6 + Math.random() * 4)
    await prisma.wellness.upsert({
      where: { userId_date: { userId: user.id, date: utcDay(offset) } },
      update: {},
      create: {
        userId: user.id,
        date: utcDay(offset),
        hrv,
        restingHr: 50 + Math.round(Math.random() * 4),
        sleepHours: 6.8 + Math.round(Math.random() * 15) / 10,
        sleepSecs: Math.round((6.8 + Math.random() * 1.5) * 3600),
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        tsb: Math.round((ctl - atl) * 10) / 10,
        lastSource: SOURCE
      }
    })
  }
  await prisma.workout.createMany({ data: workouts })

  // Coming week of planned sessions.
  const planned = [
    { offset: 0, t: EASY, title: 'Easy Run + 4 strides' },
    { offset: 1, t: TEMPO, title: 'Tempo: 3 x 10 min @ threshold' },
    { offset: 2, t: STRENGTH, title: 'Strength & Mobility' },
    { offset: 3, t: EASY, title: 'Easy Run' },
    { offset: 5, t: LONG, title: 'Long Run (100 min)' }
  ]
  for (const p of planned) {
    const durationSec = p.t.minutes * 60
    await prisma.plannedWorkout.create({
      data: {
        userId: user.id,
        externalId: `demo-plan-${p.offset}`,
        date: utcDay(p.offset),
        title: p.title,
        type: p.t.type,
        durationSec,
        distanceMeters: p.t.paceSecPerKm
          ? Math.round((durationSec / p.t.paceSecPerKm) * 1000)
          : null,
        tss: Math.round((durationSec / 3600) * p.t.intensity * p.t.intensity * 100),
        workIntensity: p.t.intensity
      }
    })
  }

  const existingGoal = await prisma.goal.findFirst({
    where: { userId: user.id, title: 'Sub-1:45 Half Marathon' }
  })
  if (!existingGoal) {
    await prisma.goal.create({
      data: {
        userId: user.id,
        type: 'EVENT',
        title: 'Sub-1:45 Half Marathon',
        description: 'Spring half marathon, flat course.',
        eventDate: utcDay(70),
        targetDate: utcDay(70),
        eventType: 'Run',
        distance: 21.1,
        priority: 'HIGH',
        status: 'ACTIVE'
      }
    })
  }

  console.log(
    `Seeded ${workouts.length} demo workouts, 42 wellness days, ${planned.length} planned sessions for ${email}`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
