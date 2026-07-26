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

export const checkins = sqliteTable(
  'checkins',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    stationId: text('station_id')
      .notNull()
      .references(() => stations.id),
    visitedAt: integer('visited_at').notNull(),
    memo: text('memo'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('checkins_user_station_idx').on(table.userId, table.stationId),
    index('checkins_user_visited_at_idx').on(table.userId, table.visitedAt),
  ],
)

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    checkinId: text('checkin_id')
      .notNull()
      .references(() => checkins.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    stationId: text('station_id')
      .notNull()
      .references(() => stations.id),
    r2Key: text('r2_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    visibility: text('visibility').notNull().default('private'),
    isPinPhoto: integer('is_pin_photo').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('photos_checkin_id_idx').on(table.checkinId),
    index('photos_user_station_idx').on(table.userId, table.stationId),
  ],
)
