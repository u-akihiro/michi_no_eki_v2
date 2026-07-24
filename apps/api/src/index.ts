import { Hono } from 'hono'
import {
  CreateCheckinRequestSchema,
  UpdateCheckinRequestSchema,
} from '@michi-no-eki/shared'
import type { Station } from '@michi-no-eki/shared'
import { and, count, countDistinct, desc, eq, max } from 'drizzle-orm'
import type { Context } from 'hono'
import {
  completeGoogleLogin,
  csrfProtection,
  getCurrentUser,
  logout,
  startGoogleLogin,
} from './auth'
import { createDb } from './db/client'
import { checkins, stations } from './db/schema'
import type { Env } from './env'

const app = new Hono<{ Bindings: Env }>()
const invalidJson = Symbol('invalidJson')
const recentCheckinsLimit = 50
const prefectureCodes = Array.from({ length: 47 }, (_, index) => index + 1)

type AppContext = Context<{ Bindings: Env }>
type Db = ReturnType<typeof createDb>

app.use('/api/*', csrfProtection())
app.use('/auth/logout', csrfProtection())

app.get('/api/health', (c) => c.text('Hello from api'))

app.get('/auth/google/login', (c) => startGoogleLogin(c))

app.get('/auth/google/callback', async (c) => {
  const db = createDb(c.env.DB)
  return completeGoogleLogin(c, db)
})

app.get('/api/me', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  return c.json({ user })
})

app.get('/api/me/visits', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const rows = await db
    .select({
      stationId: checkins.stationId,
      visitCount: count(checkins.id),
      lastVisitedAt: max(checkins.visitedAt),
    })
    .from(checkins)
    .where(eq(checkins.userId, user.id))
    .groupBy(checkins.stationId)

  return c.json(
    rows.map((row) => ({
      stationId: row.stationId,
      visitCount: row.visitCount,
      lastVisitedAt: row.lastVisitedAt ?? 0,
    })),
  )
})

app.get('/api/me/stats', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const [row] = await db
    .select({
      visitedStationCount: countDistinct(checkins.stationId),
      checkinCount: count(checkins.id),
      visitedPrefectureCount: countDistinct(stations.prefectureCode),
    })
    .from(checkins)
    .innerJoin(stations, eq(checkins.stationId, stations.id))
    .where(eq(checkins.userId, user.id))

  return c.json({
    visitedStationCount: row?.visitedStationCount ?? 0,
    checkinCount: row?.checkinCount ?? 0,
    visitedPrefectureCount: row?.visitedPrefectureCount ?? 0,
  })
})

app.get('/api/me/checkins', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const rows = await db
    .select({
      id: checkins.id,
      stationId: checkins.stationId,
      stationName: stations.name,
      prefectureCode: stations.prefectureCode,
      visitedAt: checkins.visitedAt,
      memo: checkins.memo,
    })
    .from(checkins)
    .innerJoin(stations, eq(checkins.stationId, stations.id))
    .where(eq(checkins.userId, user.id))
    .orderBy(desc(checkins.visitedAt))
    .limit(recentCheckinsLimit)

  return c.json(rows)
})

app.get('/api/me/prefecture-progress', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const [totalRows, visitedRows] = await Promise.all([
    db
      .select({
        prefectureCode: stations.prefectureCode,
        totalStationCount: count(stations.id),
      })
      .from(stations)
      .groupBy(stations.prefectureCode),
    db
      .select({
        prefectureCode: stations.prefectureCode,
        visitedStationCount: countDistinct(checkins.stationId),
      })
      .from(checkins)
      .innerJoin(stations, eq(checkins.stationId, stations.id))
      .where(eq(checkins.userId, user.id))
      .groupBy(stations.prefectureCode),
  ])

  const totalsByPrefecture = new Map(
    totalRows.map((row) => [row.prefectureCode, row.totalStationCount]),
  )
  const visitedByPrefecture = new Map(
    visitedRows.map((row) => [row.prefectureCode, row.visitedStationCount]),
  )

  return c.json(
    prefectureCodes.map((prefectureCode) => {
      const totalStationCount = totalsByPrefecture.get(prefectureCode) ?? 0
      const visitedStationCount = visitedByPrefecture.get(prefectureCode) ?? 0
      return {
        prefectureCode,
        visitedStationCount,
        totalStationCount,
        progressRate:
          totalStationCount === 0 ? 0 : visitedStationCount / totalStationCount,
      }
    }),
  )
})

app.post('/auth/logout', async (c) => {
  const db = createDb(c.env.DB)
  return logout(c, db)
})

app.get('/api/stations', async (c) => {
  const db = createDb(c.env.DB)
  const rows = await db
    .select({
      id: stations.id,
      sourceStationId: stations.sourceStationId,
      name: stations.name,
      prefectureCode: stations.prefectureCode,
      address: stations.address,
      homepageUrl: stations.homepageUrl,
      latitude: stations.latitude,
      longitude: stations.longitude,
    })
    .from(stations)

  const mappedStations: Station[] = rows
    .filter(
      (
        station,
      ): station is typeof station & {
        latitude: number
        longitude: number
      } => station.latitude !== null && station.longitude !== null,
    )
    .map((station) => ({
      id: station.id,
      sourceStationId: station.sourceStationId,
      name: station.name,
      prefectureCode: station.prefectureCode,
      address: station.address,
      homepageUrl: station.homepageUrl,
      latitude: station.latitude,
      longitude: station.longitude,
    }))

  return c.json(mappedStations)
})

app.post('/api/stations/:stationId/checkins', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const stationId = c.req.param('stationId')
  const stationExists = await findStation(db, stationId)
  if (!stationExists) {
    return c.json({ error: 'station not found' }, 404)
  }

  const body = await readJsonBody(c)
  if (body === invalidJson) {
    return c.json({ error: 'invalid request' }, 400)
  }

  const parsed = CreateCheckinRequestSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid request' }, 400)
  }

  const now = Date.now()
  const [created] = await db
    .insert(checkins)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      stationId,
      visitedAt: parsed.data.visitedAt ?? now,
      memo: parsed.data.memo ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!created) {
    return c.json({ error: 'failed to create checkin' }, 500)
  }

  return c.json(created, 201)
})

app.get('/api/stations/:stationId/checkins', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const stationId = c.req.param('stationId')
  const stationExists = await findStation(db, stationId)
  if (!stationExists) {
    return c.json({ error: 'station not found' }, 404)
  }

  const rows = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.userId, user.id), eq(checkins.stationId, stationId)))
    .orderBy(desc(checkins.visitedAt))

  return c.json(rows)
})

app.patch('/api/checkins/:checkinId', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const body = await readJsonBody(c)
  if (body === invalidJson) {
    return c.json({ error: 'invalid request' }, 400)
  }

  const parsed = UpdateCheckinRequestSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid request' }, 400)
  }

  const now = Date.now()
  const [updated] = await db
    .update(checkins)
    .set({
      ...('visitedAt' in parsed.data
        ? { visitedAt: parsed.data.visitedAt }
        : {}),
      ...('memo' in parsed.data ? { memo: parsed.data.memo } : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(checkins.id, c.req.param('checkinId')),
        eq(checkins.userId, user.id),
      ),
    )
    .returning()

  if (!updated) {
    return c.json({ error: 'not found' }, 404)
  }

  return c.json(updated)
})

app.delete('/api/checkins/:checkinId', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const [deleted] = await db
    .delete(checkins)
    .where(
      and(
        eq(checkins.id, c.req.param('checkinId')),
        eq(checkins.userId, user.id),
      ),
    )
    .returning({ id: checkins.id })

  if (!deleted) {
    return c.json({ error: 'not found' }, 404)
  }

  return c.json({ ok: true })
})

app.notFound((c) => c.json({ error: 'not found' }, 404))

const readJsonBody = async (c: AppContext) => {
  const text = await c.req.text()
  if (text.trim() === '') {
    return {}
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return invalidJson
  }
}

const findStation = async (db: Db, stationId: string) => {
  const [row] = await db
    .select({ id: stations.id })
    .from(stations)
    .where(eq(stations.id, stationId))
    .limit(1)

  return row ?? null
}

export default app
