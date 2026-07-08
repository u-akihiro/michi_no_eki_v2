import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const stations = sqliteTable('stations', {
  id: text('id').primaryKey(),
  sourceStationId: integer('source_station_id').notNull().unique(),
  prefectureCode: integer('prefecture_code').notNull(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  homepageUrl: text('homepage_url'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})
