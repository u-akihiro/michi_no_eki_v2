import { Hono } from 'hono'
import type { Station } from '@michi-no-eki/shared'
import { createDb } from './db/client'
import { stations } from './db/schema'
import type { Env } from './env'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.text('Hello from api'))

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

app.notFound((c) => c.json({ error: 'not found' }, 404))

export default app
