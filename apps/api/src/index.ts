import { Hono } from 'hono'
import {
  CreateCheckinRequestSchema,
  PinPhotoRequestSchema,
  UpdateCheckinRequestSchema,
} from '@michi-no-eki/shared'
import type { Station } from '@michi-no-eki/shared'
import { and, count, countDistinct, desc, eq, max, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import {
  completeGoogleLogin,
  csrfProtection,
  getCurrentUser,
  logout,
  startGoogleLogin,
} from './auth'
import { createDb } from './db/client'
import { checkins, photos, stations } from './db/schema'
import type { Env } from './env'
import { createPhotoStorage } from './storage/photo-storage'

const app = new Hono<{ Bindings: Env }>()
const invalidJson = Symbol('invalidJson')
const recentCheckinsLimit = 50
const maxPhotoBytes = 10 * 1024 * 1024
const privatePhotoCacheControl = 'private, no-store'
const publicPhotoCacheControl = 'public, max-age=31536000, immutable'
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
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      pictureUrl: user.pictureUrl,
      createdAt: user.createdAt,
    },
  })
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

  const [row, photoCountRow] = await Promise.all([
    db
      .select({
        visitedStationCount: countDistinct(checkins.stationId),
        checkinCount: count(checkins.id),
        visitedPrefectureCount: countDistinct(stations.prefectureCode),
      })
      .from(checkins)
      .innerJoin(stations, eq(checkins.stationId, stations.id))
      .where(eq(checkins.userId, user.id)),
    db
      .select({
        photoCount: count(photos.id),
      })
      .from(photos)
      .where(eq(photos.userId, user.id)),
  ])

  const [statsRow] = row
  const [photoStatsRow] = photoCountRow

  return c.json({
    visitedStationCount: statsRow?.visitedStationCount ?? 0,
    checkinCount: statsRow?.checkinCount ?? 0,
    visitedPrefectureCount: statsRow?.visitedPrefectureCount ?? 0,
    photoCount: photoStatsRow?.photoCount ?? 0,
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

app.get('/api/me/pin-photos', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const rows = await db
    .select({
      stationId: photos.stationId,
      photoId: photos.id,
    })
    .from(photos)
    .where(and(eq(photos.userId, user.id), eq(photos.isPinPhoto, 1)))

  return c.json(rows)
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

app.post('/api/checkins/:checkinId/photos', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const checkin = await findOwnedCheckin(db, c.req.param('checkinId'), user.id)
  if (!checkin) {
    return c.json({ error: 'not found' }, 404)
  }

  const body = await c.req.parseBody()
  const file = body.file
  if (!(file instanceof File)) {
    return c.json({ error: 'invalid file' }, 400)
  }

  const contentType = await validatePhotoFile(file)
  if (contentType === null) {
    return c.json({ error: 'invalid file' }, 400)
  }

  const [sortOrderRow] = await db
    .select({ maxSortOrder: max(photos.sortOrder) })
    .from(photos)
    .where(eq(photos.checkinId, checkin.id))

  const id = crypto.randomUUID()
  const r2Key = `users/${user.id}/checkins/${checkin.id}/${id}`
  const createdAt = Date.now()
  const storage = createPhotoStorage(c.env.PHOTOS)

  await storage.put(r2Key, file.stream(), {
    httpMetadata: { contentType },
  })

  try {
    const [created] = await db
      .insert(photos)
      .values({
        id,
        checkinId: checkin.id,
        userId: user.id,
        stationId: checkin.stationId,
        r2Key,
        contentType,
        visibility: 'private',
        isPinPhoto: 0,
        sortOrder: (sortOrderRow?.maxSortOrder ?? -1) + 1,
        createdAt,
      })
      .returning()

    if (!created) {
      await storage.delete(r2Key)
      return c.json({ error: 'failed to create photo' }, 500)
    }

    return c.json(created, 201)
  } catch (error) {
    await storage.delete(r2Key)
    throw error
  }
})

app.get('/api/checkins/:checkinId/photos', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const checkin = await findOwnedCheckin(db, c.req.param('checkinId'), user.id)
  if (!checkin) {
    return c.json({ error: 'not found' }, 404)
  }

  const rows = await db
    .select()
    .from(photos)
    .where(eq(photos.checkinId, checkin.id))
    .orderBy(photos.sortOrder)

  return c.json(rows)
})

app.get('/api/photos/:id', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const [photo] = await db
    .select()
    .from(photos)
    .where(eq(photos.id, c.req.param('id')))
    .limit(1)

  if (!photo) {
    return c.json({ error: 'not found' }, 404)
  }

  const canRead = photo.userId === user.id || photo.visibility === 'public'
  if (!canRead) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const object = await createPhotoStorage(c.env.PHOTOS).get(photo.r2Key)
  if (!object) {
    return c.json({ error: 'not found' }, 404)
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control':
        photo.visibility === 'public'
          ? publicPhotoCacheControl
          : privatePhotoCacheControl,
    },
  })
})

app.put('/api/photos/:id/pin', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const body = await readJsonBody(c)
  if (body === invalidJson) {
    return c.json({ error: 'invalid request' }, 400)
  }

  const parsed = PinPhotoRequestSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid request' }, 400)
  }

  const [photo] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, c.req.param('id')), eq(photos.userId, user.id)))
    .limit(1)

  if (!photo) {
    return c.json({ error: 'not found' }, 404)
  }

  if (parsed.data.isPin) {
    await db
      .update(photos)
      .set({
        isPinPhoto: sql`case when ${photos.id} = ${photo.id} then 1 else 0 end`,
      })
      .where(
        and(eq(photos.userId, user.id), eq(photos.stationId, photo.stationId)),
      )
  } else {
    await db
      .update(photos)
      .set({ isPinPhoto: 0 })
      .where(and(eq(photos.id, photo.id), eq(photos.userId, user.id)))
  }

  const [updated] = await db
    .select()
    .from(photos)
    .where(eq(photos.id, photo.id))
    .limit(1)

  if (!updated) {
    return c.json({ error: 'not found' }, 404)
  }

  return c.json(updated)
})

app.delete('/api/photos/:id', async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(c, db)
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const [photo] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, c.req.param('id')), eq(photos.userId, user.id)))
    .limit(1)

  if (!photo) {
    return c.json({ error: 'not found' }, 404)
  }

  await createPhotoStorage(c.env.PHOTOS).delete(photo.r2Key)
  await db
    .delete(photos)
    .where(and(eq(photos.id, photo.id), eq(photos.userId, user.id)))

  return c.body(null, 204)
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

  const checkin = await findOwnedCheckin(db, c.req.param('checkinId'), user.id)
  if (!checkin) {
    return c.json({ error: 'not found' }, 404)
  }

  const storage = createPhotoStorage(c.env.PHOTOS)
  const checkinPhotos = await db
    .select({ id: photos.id, r2Key: photos.r2Key })
    .from(photos)
    .where(eq(photos.checkinId, checkin.id))

  await Promise.all(checkinPhotos.map((photo) => storage.delete(photo.r2Key)))
  await db.delete(photos).where(eq(photos.checkinId, checkin.id))

  const [deleted] = await db
    .delete(checkins)
    .where(and(eq(checkins.id, checkin.id), eq(checkins.userId, user.id)))
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

const findOwnedCheckin = async (db: Db, checkinId: string, userId: string) => {
  const [row] = await db
    .select({ id: checkins.id, stationId: checkins.stationId })
    .from(checkins)
    .where(and(eq(checkins.id, checkinId), eq(checkins.userId, userId)))
    .limit(1)

  return row ?? null
}

const validatePhotoFile = async (file: File) => {
  if (file.size <= 0 || file.size > maxPhotoBytes) {
    return null
  }

  const declaredContentType = file.type
  if (
    declaredContentType !== 'image/jpeg' &&
    declaredContentType !== 'image/png'
  ) {
    return null
  }

  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const detectedContentType = isJpegSignature(signature)
    ? 'image/jpeg'
    : isPngSignature(signature)
      ? 'image/png'
      : null

  return detectedContentType === declaredContentType
    ? detectedContentType
    : null
}

const isJpegSignature = (signature: Uint8Array) =>
  signature.length >= 3 &&
  signature[0] === 0xff &&
  signature[1] === 0xd8 &&
  signature[2] === 0xff

const isPngSignature = (signature: Uint8Array) =>
  signature.length >= 8 &&
  signature[0] === 0x89 &&
  signature[1] === 0x50 &&
  signature[2] === 0x4e &&
  signature[3] === 0x47 &&
  signature[4] === 0x0d &&
  signature[5] === 0x0a &&
  signature[6] === 0x1a &&
  signature[7] === 0x0a

export default app
