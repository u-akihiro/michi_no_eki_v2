import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

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

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  name: text('name'),
  pictureUrl: text('picture_url'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    userAgent: text('user_agent'),
  },
  (table) => [index('sessions_expires_at_idx').on(table.expiresAt)],
)
