import { z } from 'zod'

export const STATION_ID_NAMESPACE = '615c3168-7878-4e61-b458-a225b3261663'

export const PREFECTURE_CODE_BY_NAME = {
  北海道: 1,
  青森県: 2,
  岩手県: 3,
  宮城県: 4,
  秋田県: 5,
  山形県: 6,
  福島県: 7,
  茨城県: 8,
  栃木県: 9,
  群馬県: 10,
  埼玉県: 11,
  千葉県: 12,
  東京都: 13,
  神奈川県: 14,
  新潟県: 15,
  富山県: 16,
  石川県: 17,
  福井県: 18,
  山梨県: 19,
  長野県: 20,
  岐阜県: 21,
  静岡県: 22,
  愛知県: 23,
  三重県: 24,
  滋賀県: 25,
  京都府: 26,
  大阪府: 27,
  兵庫県: 28,
  奈良県: 29,
  和歌山県: 30,
  鳥取県: 31,
  島根県: 32,
  岡山県: 33,
  広島県: 34,
  山口県: 35,
  徳島県: 36,
  香川県: 37,
  愛媛県: 38,
  高知県: 39,
  福岡県: 40,
  佐賀県: 41,
  長崎県: 42,
  熊本県: 43,
  大分県: 44,
  宮崎県: 45,
  鹿児島県: 46,
  沖縄県: 47,
} as const

export const PREFECTURE_NAME_BY_CODE = Object.fromEntries(
  Object.entries(PREFECTURE_CODE_BY_NAME).map(([name, code]) => [code, name]),
) as Readonly<Record<number, PrefectureName>>

export const HOKKAIDO_AREA_CODES = {
  道北: 101,
  道央: 102,
  道東: 103,
  道南: 104,
} as const

export const AREA_LABEL_BY_CODE = {
  ...PREFECTURE_NAME_BY_CODE,
  [HOKKAIDO_AREA_CODES.道北]: '道北',
  [HOKKAIDO_AREA_CODES.道央]: '道央',
  [HOKKAIDO_AREA_CODES.道東]: '道東',
  [HOKKAIDO_AREA_CODES.道南]: '道南',
} as Readonly<Record<AreaCode, string>>

export const SUBPREFECTURE_TO_AREA = {
  渡島: HOKKAIDO_AREA_CODES.道南,
  檜山: HOKKAIDO_AREA_CODES.道南,
  石狩: HOKKAIDO_AREA_CODES.道央,
  後志: HOKKAIDO_AREA_CODES.道央,
  空知: HOKKAIDO_AREA_CODES.道央,
  胆振: HOKKAIDO_AREA_CODES.道央,
  日高: HOKKAIDO_AREA_CODES.道央,
  上川: HOKKAIDO_AREA_CODES.道北,
  留萌: HOKKAIDO_AREA_CODES.道北,
  宗谷: HOKKAIDO_AREA_CODES.道北,
  オホーツク: HOKKAIDO_AREA_CODES.道東,
  十勝: HOKKAIDO_AREA_CODES.道東,
  釧路: HOKKAIDO_AREA_CODES.道東,
  根室: HOKKAIDO_AREA_CODES.道東,
} as const

export type HokkaidoSubprefecture = keyof typeof SUBPREFECTURE_TO_AREA

export const HOKKAIDO_MUNICIPALITY_TO_SUBPREFECTURE = {
  三笠市: '空知',
  上川郡剣淵町: '上川',
  上川郡当麻町: '上川',
  上川郡東川町: '上川',
  上川郡美瑛町: '上川',
  上磯郡木古内町: '渡島',
  上磯郡知内町: '渡島',
  中川郡中川町: '上川',
  中川郡幕別町: '十勝',
  中川郡本別町: '十勝',
  中川郡美深町: '上川',
  中川郡音威子府村: '上川',
  久遠郡せたな町: '檜山',
  亀田郡七飯町: '渡島',
  伊達市: '胆振',
  余市郡余市町: '後志',
  余市郡赤井川村: '後志',
  函館市: '渡島',
  帯広市: '十勝',
  勇払郡むかわ町: '胆振',
  勇払郡占冠村: '上川',
  勇払郡安平町: '胆振',
  北見市: 'オホーツク',
  十勝郡浦幌町: '十勝',
  千歳市: '石狩',
  厚岸郡厚岸町: '釧路',
  古宇郡神恵内村: '後志',
  古平郡古平町: '後志',
  名寄市: '上川',
  士別市: '上川',
  夕張市: '空知',
  夕張郡長沼町: '空知',
  天塩郡天塩町: '留萌',
  天塩郡遠別町: '留萌',
  宗谷郡猿払村: '宗谷',
  室蘭市: '胆振',
  寿都郡寿都町: '後志',
  寿都郡黒松内町: '後志',
  岩内郡岩内町: '後志',
  島牧郡島牧村: '後志',
  川上郡弟子屈町: '釧路',
  常呂郡佐呂間町: 'オホーツク',
  広尾郡大樹町: '十勝',
  恵庭市: '石狩',
  斜里郡小清水町: 'オホーツク',
  斜里郡斜里町: 'オホーツク',
  斜里郡清里町: 'オホーツク',
  新冠郡新冠町: '日高',
  日高郡新ひだか町: '日高',
  旭川市: '上川',
  有珠郡壮瞥町: '胆振',
  松前郡松前町: '渡島',
  松前郡福島町: '渡島',
  枝幸郡中頓別町: '宗谷',
  枝幸郡枝幸町: '宗谷',
  枝幸郡浜頓別町: '宗谷',
  根室市: '根室',
  樺戸郡月形町: '空知',
  樺戸郡浦臼町: '空知',
  檜山郡上ノ国町: '檜山',
  檜山郡厚沢部町: '檜山',
  檜山郡江差町: '檜山',
  歌志内市: '空知',
  沙流郡日高町: '日高',
  河東郡上士幌町: '十勝',
  河東郡士幌町: '十勝',
  河東郡音更町: '十勝',
  河東郡鹿追町: '十勝',
  河西郡中札内村: '十勝',
  河西郡更別村: '十勝',
  深川市: '空知',
  滝川市: '空知',
  爾志郡乙部町: '檜山',
  留萌市: '留萌',
  留萌郡小平町: '留萌',
  白糠郡白糠町: '釧路',
  目梨郡羅臼町: '根室',
  石狩市: '石狩',
  石狩郡当別町: '石狩',
  石狩郡新篠津村: '石狩',
  磯谷郡蘭越町: '後志',
  稚内市: '宗谷',
  空知郡南富良野町: '上川',
  空知郡奈井江町: '空知',
  紋別市: 'オホーツク',
  紋別郡湧別町: 'オホーツク',
  紋別郡滝上町: 'オホーツク',
  紋別郡興部町: 'オホーツク',
  紋別郡西興部村: 'オホーツク',
  紋別郡遠軽町: 'オホーツク',
  紋別郡雄武町: 'オホーツク',
  網走市: 'オホーツク',
  網走郡大空町: 'オホーツク',
  網走郡津別町: 'オホーツク',
  網走郡美幌町: 'オホーツク',
  芦別市: '空知',
  苫前郡初山別村: '留萌',
  苫前郡羽幌町: '留萌',
  苫前郡苫前町: '留萌',
  苫小牧市: '胆振',
  茅部郡森町: '渡島',
  茅部郡鹿部町: '渡島',
  虻田郡ニセコ町: '後志',
  虻田郡京極町: '後志',
  虻田郡喜茂別町: '後志',
  虻田郡洞爺湖町: '胆振',
  虻田郡留寿都村: '後志',
  虻田郡真狩村: '後志',
  虻田郡豊浦町: '胆振',
  足寄郡足寄町: '十勝',
  足寄郡陸別町: '十勝',
  野付郡別海町: '根室',
  釧路市: '釧路',
  雨竜郡北竜町: '空知',
  雨竜郡幌加内町: '上川',
  雨竜郡秩父別町: '空知',
  雨竜郡雨竜町: '空知',
} as const satisfies Readonly<Record<string, HokkaidoSubprefecture>>

const warnedUnknownHokkaidoMunicipalities = new Set<string>()
const hokkaidoMunicipalitySubprefectureByName =
  HOKKAIDO_MUNICIPALITY_TO_SUBPREFECTURE as Readonly<
    Record<string, HokkaidoSubprefecture>
  >

export function extractHokkaidoMunicipality(address: string) {
  const normalizedAddress = address.replace(/^北海道/, '').trim()
  const countyMatch = normalizedAddress.match(/^[^\s]+?郡[^\s]+?[町村]/)

  if (countyMatch !== null) {
    return countyMatch[0]
  }

  return normalizedAddress.match(/^[^\s]+?市/)?.[0] ?? null
}

function warnUnknownHokkaidoMunicipality(municipality: string | null) {
  const key = municipality ?? '(unknown)'

  if (warnedUnknownHokkaidoMunicipalities.has(key)) {
    return
  }

  const viteEnv = (import.meta as { env?: { DEV?: boolean } }).env
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
    .process?.env?.NODE_ENV
  const isDevelopment = viteEnv?.DEV ?? nodeEnv !== 'production'

  if (isDevelopment && typeof console !== 'undefined') {
    console.warn(`Unknown Hokkaido municipality: ${key}. Falling back to 道央.`)
  }

  warnedUnknownHokkaidoMunicipalities.add(key)
}

export function getStationAreaCode(station: Station): AreaCode {
  if (station.prefectureCode !== PREFECTURE_CODE_BY_NAME.北海道) {
    return station.prefectureCode
  }

  const municipality = extractHokkaidoMunicipality(station.address)
  const subprefecture =
    municipality === null
      ? undefined
      : hokkaidoMunicipalitySubprefectureByName[municipality]

  if (subprefecture === undefined) {
    warnUnknownHokkaidoMunicipality(municipality)
    return HOKKAIDO_AREA_CODES.道央
  }

  return SUBPREFECTURE_TO_AREA[subprefecture]
}

export const REGIONS = [
  {
    name: '北海道',
    areaCodes: [
      HOKKAIDO_AREA_CODES.道北,
      HOKKAIDO_AREA_CODES.道央,
      HOKKAIDO_AREA_CODES.道東,
      HOKKAIDO_AREA_CODES.道南,
    ],
  },
  {
    name: '東北',
    areaCodes: [
      PREFECTURE_CODE_BY_NAME.青森県,
      PREFECTURE_CODE_BY_NAME.岩手県,
      PREFECTURE_CODE_BY_NAME.宮城県,
      PREFECTURE_CODE_BY_NAME.秋田県,
      PREFECTURE_CODE_BY_NAME.山形県,
      PREFECTURE_CODE_BY_NAME.福島県,
    ],
  },
  {
    name: '関東',
    areaCodes: [
      PREFECTURE_CODE_BY_NAME.茨城県,
      PREFECTURE_CODE_BY_NAME.栃木県,
      PREFECTURE_CODE_BY_NAME.群馬県,
      PREFECTURE_CODE_BY_NAME.埼玉県,
      PREFECTURE_CODE_BY_NAME.千葉県,
      PREFECTURE_CODE_BY_NAME.東京都,
      PREFECTURE_CODE_BY_NAME.神奈川県,
    ],
  },
  {
    name: '中部',
    areaCodes: [
      PREFECTURE_CODE_BY_NAME.新潟県,
      PREFECTURE_CODE_BY_NAME.富山県,
      PREFECTURE_CODE_BY_NAME.石川県,
      PREFECTURE_CODE_BY_NAME.福井県,
      PREFECTURE_CODE_BY_NAME.山梨県,
      PREFECTURE_CODE_BY_NAME.長野県,
      PREFECTURE_CODE_BY_NAME.岐阜県,
      PREFECTURE_CODE_BY_NAME.静岡県,
      PREFECTURE_CODE_BY_NAME.愛知県,
    ],
  },
  {
    name: '近畿',
    areaCodes: [
      PREFECTURE_CODE_BY_NAME.三重県,
      PREFECTURE_CODE_BY_NAME.滋賀県,
      PREFECTURE_CODE_BY_NAME.京都府,
      PREFECTURE_CODE_BY_NAME.大阪府,
      PREFECTURE_CODE_BY_NAME.兵庫県,
      PREFECTURE_CODE_BY_NAME.奈良県,
      PREFECTURE_CODE_BY_NAME.和歌山県,
    ],
  },
  {
    name: '中国',
    areaCodes: [
      PREFECTURE_CODE_BY_NAME.鳥取県,
      PREFECTURE_CODE_BY_NAME.島根県,
      PREFECTURE_CODE_BY_NAME.岡山県,
      PREFECTURE_CODE_BY_NAME.広島県,
      PREFECTURE_CODE_BY_NAME.山口県,
    ],
  },
  {
    name: '四国',
    areaCodes: [
      PREFECTURE_CODE_BY_NAME.徳島県,
      PREFECTURE_CODE_BY_NAME.香川県,
      PREFECTURE_CODE_BY_NAME.愛媛県,
      PREFECTURE_CODE_BY_NAME.高知県,
    ],
  },
  {
    name: '九州・沖縄',
    areaCodes: [
      PREFECTURE_CODE_BY_NAME.福岡県,
      PREFECTURE_CODE_BY_NAME.佐賀県,
      PREFECTURE_CODE_BY_NAME.長崎県,
      PREFECTURE_CODE_BY_NAME.熊本県,
      PREFECTURE_CODE_BY_NAME.大分県,
      PREFECTURE_CODE_BY_NAME.宮崎県,
      PREFECTURE_CODE_BY_NAME.鹿児島県,
      PREFECTURE_CODE_BY_NAME.沖縄県,
    ],
  },
] as const

export const StationSchema = z.object({
  id: z.uuid(),
  sourceStationId: z.number().int().positive(),
  name: z.string().min(1),
  prefectureCode: z.number().int().min(1).max(47),
  address: z.string().min(1),
  homepageUrl: z.string().min(1).nullable(),
  latitude: z.number().min(20).max(46),
  longitude: z.number().min(122).max(154),
})

export const StationsSchema = z.array(StationSchema)

export const CheckinSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  stationId: z.uuid(),
  visitedAt: z.number().int().nonnegative(),
  memo: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const CreateCheckinRequestSchema = z.object({
  visitedAt: z.number().int().nonnegative().optional(),
  memo: z.string().nullable().optional(),
})

export const UpdateCheckinRequestSchema = z
  .object({
    visitedAt: z.number().int().nonnegative().optional(),
    memo: z.string().nullable().optional(),
  })
  .refine((value) => value.visitedAt !== undefined || value.memo !== undefined)

export const PinPhotoRequestSchema = z.object({
  isPin: z.boolean(),
})

export const PhotoSchema = z.object({
  id: z.uuid(),
  checkinId: z.uuid(),
  userId: z.uuid(),
  stationId: z.uuid(),
  r2Key: z.string().min(1),
  contentType: z.string().min(1),
  visibility: z.string().min(1),
  isPinPhoto: z.number().int().min(0).max(1),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
})

export const PinPhotoSummarySchema = z.object({
  stationId: z.uuid(),
  photoId: z.uuid(),
})

export const VisitSummarySchema = z.object({
  stationId: z.uuid(),
  visitCount: z.number().int().nonnegative(),
  lastVisitedAt: z.number().int().nonnegative(),
})

export const StatsSchema = z.object({
  visitedStationCount: z.number().int().nonnegative(),
  checkinCount: z.number().int().nonnegative(),
  visitedPrefectureCount: z.number().int().nonnegative(),
  photoCount: z.number().int().nonnegative(),
})

export const RecentCheckinSchema = z.object({
  id: z.uuid(),
  stationId: z.uuid(),
  stationName: z.string().min(1),
  prefectureCode: z.number().int().min(1).max(47),
  visitedAt: z.number().int().nonnegative(),
  memo: z.string().nullable(),
})

export const PrefectureProgressSchema = z.object({
  prefectureCode: z.number().int().min(1).max(47),
  visitedStationCount: z.number().int().nonnegative(),
  totalStationCount: z.number().int().nonnegative(),
  progressRate: z.number().min(0).max(1),
})

export const CheckinsSchema = z.array(CheckinSchema)
export const PhotosSchema = z.array(PhotoSchema)
export const PinPhotoSummariesSchema = z.array(PinPhotoSummarySchema)
export const VisitsSchema = z.array(VisitSummarySchema)
export const RecentCheckinsSchema = z.array(RecentCheckinSchema)
export const PrefectureProgressListSchema = z.array(PrefectureProgressSchema)

export type PrefectureName = keyof typeof PREFECTURE_CODE_BY_NAME
export type PrefectureCode =
  (typeof PREFECTURE_CODE_BY_NAME)[keyof typeof PREFECTURE_CODE_BY_NAME]
export type AreaCode = number
export type Region = (typeof REGIONS)[number]
export type Station = z.infer<typeof StationSchema>
export type Checkin = z.infer<typeof CheckinSchema>
export type CreateCheckinRequest = z.infer<typeof CreateCheckinRequestSchema>
export type UpdateCheckinRequest = z.infer<typeof UpdateCheckinRequestSchema>
export type PinPhotoRequest = z.infer<typeof PinPhotoRequestSchema>
export type Photo = z.infer<typeof PhotoSchema>
export type PinPhotoSummary = z.infer<typeof PinPhotoSummarySchema>
export type VisitSummary = z.infer<typeof VisitSummarySchema>
export type Stats = z.infer<typeof StatsSchema>
export type RecentCheckin = z.infer<typeof RecentCheckinSchema>
export type PrefectureProgress = z.infer<typeof PrefectureProgressSchema>
