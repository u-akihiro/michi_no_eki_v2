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

export const REGIONS = [
  {
    name: '北海道',
    prefectureCodes: [PREFECTURE_CODE_BY_NAME.北海道],
  },
  {
    name: '東北',
    prefectureCodes: [
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
    prefectureCodes: [
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
    prefectureCodes: [
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
    prefectureCodes: [
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
    prefectureCodes: [
      PREFECTURE_CODE_BY_NAME.鳥取県,
      PREFECTURE_CODE_BY_NAME.島根県,
      PREFECTURE_CODE_BY_NAME.岡山県,
      PREFECTURE_CODE_BY_NAME.広島県,
      PREFECTURE_CODE_BY_NAME.山口県,
    ],
  },
  {
    name: '四国',
    prefectureCodes: [
      PREFECTURE_CODE_BY_NAME.徳島県,
      PREFECTURE_CODE_BY_NAME.香川県,
      PREFECTURE_CODE_BY_NAME.愛媛県,
      PREFECTURE_CODE_BY_NAME.高知県,
    ],
  },
  {
    name: '九州・沖縄',
    prefectureCodes: [
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

export type PrefectureName = keyof typeof PREFECTURE_CODE_BY_NAME
export type PrefectureCode =
  (typeof PREFECTURE_CODE_BY_NAME)[keyof typeof PREFECTURE_CODE_BY_NAME]
export type Region = (typeof REGIONS)[number]
export type Station = z.infer<typeof StationSchema>
