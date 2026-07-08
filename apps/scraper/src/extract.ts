import { load } from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import {
  PREFECTURE_CODE_BY_NAME,
  STATION_ID_NAMESPACE,
  type Station,
} from '@michi-no-eki/shared'
import { v5 as uuidv5 } from 'uuid'

export type StationRef = {
  path: string
  sourceStationId: number
  prefectureName: string | null
}

export type MapCoordsResult = {
  coords: { latitude: number; longitude: number } | null
  warnings: string[]
}

export type DetailExtractResult = {
  name: string
  address: string
  homepageUrl: string | null
  prefectureCode: number | null
  coords: { latitude: number; longitude: number } | null
  warnings: string[]
}

const PREFECTURE_NAMES = Object.keys(PREFECTURE_CODE_BY_NAME)
const POSTAL_CODE_RE = /〒?\s*\d{3}[-－]\d{3,4}\s*|〒?\s*\d{7}\s*/g
const MAP_Q_RE = /(?:\?|&)q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:&|$)/
const DETAIL_PATH_RE = /^\/stations\/views\/(\d+)$/
const JP_LAT_MIN = 20
const JP_LAT_MAX = 46
const JP_LON_MIN = 122
const JP_LON_MAX = 154

export function extractLastPage(html: string): number {
  const $ = load(html)
  const href = $('span.last a').attr('href')
  if (href === undefined) {
    return 0
  }
  const page = extractPageParam(href)
  return page ?? 0
}

export function extractStationRefs(html: string): StationRef[] {
  const $ = load(html)
  const refs: StationRef[] = []
  const seen = new Set<string>()

  $('.searchList li > a[href^="/stations/views/"]').each((_, element) => {
    const card = $(element)
    const path = card.attr('href')
    if (path === undefined || seen.has(path)) {
      return
    }
    const sourceStationId = extractSourceStationId(path)
    if (sourceStationId === null) {
      return
    }
    seen.add(path)
    refs.push({
      path,
      sourceStationId,
      prefectureName: extractPrefectureName(
        card.find('div.txt').first().text(),
      ),
    })
  })

  return refs
}

export function extractDataBoxes(html: string): StationRef[] {
  const $ = load(html)
  const refs: StationRef[] = []
  const seen = new Set<string>()

  $('div.js-data-box[data-link^="/stations/views/"]').each((_, element) => {
    const path = $(element).attr('data-link')
    if (path === undefined || seen.has(path)) {
      return
    }
    const sourceStationId = extractSourceStationId(path)
    if (sourceStationId === null) {
      return
    }
    seen.add(path)
    refs.push({ path, sourceStationId, prefectureName: null })
  })

  return refs
}

export function extractStationDetail(
  html: string,
  fallbackPrefectureName: string | null,
): DetailExtractResult {
  const $ = load(html)
  const fields = extractDlFields($)
  const rawName = fields.get('道の駅名')?.text ?? ''
  const rawAddress = fields.get('所在地')?.text ?? ''
  const homepageHref = fields.get('ホームページ')?.href ?? null
  const address = normalizeAddress(rawAddress)
  const fallbackPrefecture =
    fallbackPrefectureName === null
      ? null
      : extractPrefectureName(fallbackPrefectureName)
  const prefectureName = extractPrefectureName(address) ?? fallbackPrefecture
  const prefectureCode =
    prefectureName === null ? null : PREFECTURE_CODE_BY_NAME[prefectureName]
  const coords = extractMapCoords(html)

  return {
    name: normalizeWidth(rawName).trim(),
    address,
    homepageUrl: normalizeHomepageUrl(homepageHref),
    prefectureCode,
    coords: coords.coords,
    warnings: coords.warnings,
  }
}

export function extractMapCoords(html: string): MapCoordsResult {
  const $ = load(html)
  const warnings: string[] = []
  const matches: Array<{ latitude: number; longitude: number; raw: string }> =
    []

  $('iframe[src]').each((_, element) => {
    const src = $(element).attr('src') ?? ''
    if (!/\/maps\/embed\/v1\/place\b/.test(src)) {
      return
    }
    const match = MAP_Q_RE.exec(src)
    if (match === null) {
      return
    }
    const latText = match[1]
    const lonText = match[2]
    if (latText === undefined || lonText === undefined) {
      return
    }
    const latitude = Number(latText)
    const longitude = Number(lonText)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return
    }
    matches.push({ latitude, longitude, raw: `${latText},${lonText}` })
  })

  if (matches.length === 0) {
    return { coords: null, warnings }
  }

  const first = matches[0]
  if (first === undefined) {
    return { coords: null, warnings }
  }

  const hasDivergence = matches.some(
    (match) =>
      match.latitude !== first.latitude || match.longitude !== first.longitude,
  )
  if (hasDivergence) {
    warnings.push(
      `divergent map iframes found (${matches.map((match) => match.raw).join(', ')})`,
    )
  }

  if (!isJapanCoordinate(first.latitude, first.longitude)) {
    warnings.push(
      `coordinates outside Japan range: ${first.latitude},${first.longitude}`,
    )
    return { coords: null, warnings }
  }

  return {
    coords: { latitude: first.latitude, longitude: first.longitude },
    warnings,
  }
}

export function extractSourceStationId(path: string): number | null {
  const match = DETAIL_PATH_RE.exec(path)
  const idText = match?.[1]
  if (idText === undefined) {
    return null
  }
  const id = Number(idText)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function generateStationId(sourceStationId: number): string {
  return uuidv5(`station:${sourceStationId}`, STATION_ID_NAMESPACE)
}

export function buildStation(
  ref: StationRef,
  detail: DetailExtractResult,
): { station: Station | null; errors: string[] } {
  const errors: string[] = []
  if (detail.name === '') {
    errors.push('missing station name')
  }
  if (detail.address === '') {
    errors.push('missing address')
  }
  if (detail.prefectureCode === null) {
    errors.push(`missing prefecture code for address "${detail.address}"`)
  }
  if (detail.coords === null) {
    errors.push('missing valid map coordinates')
  }
  if (
    errors.length > 0 ||
    detail.prefectureCode === null ||
    detail.coords === null
  ) {
    return { station: null, errors }
  }

  return {
    station: {
      id: generateStationId(ref.sourceStationId),
      sourceStationId: ref.sourceStationId,
      name: detail.name,
      prefectureCode: detail.prefectureCode,
      address: detail.address,
      homepageUrl: detail.homepageUrl,
      latitude: detail.coords.latitude,
      longitude: detail.coords.longitude,
    },
    errors,
  }
}

export function normalizeAddress(value: string): string {
  return normalizeWidth(value)
    .replace(POSTAL_CODE_RE, '')
    .trim()
    .replaceAll(' ', '')
}

export function normalizeWidth(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.codePointAt(0)
    if (code === undefined) {
      continue
    }
    if (code >= 0xff01 && code <= 0xff5e) {
      result += String.fromCodePoint(code - 0xfee0)
    } else if (code === 0x3000) {
      result += ' '
    } else {
      result += char
    }
  }
  return result
}

export function extractPrefectureName(
  value: string,
): keyof typeof PREFECTURE_CODE_BY_NAME | null {
  const trimmed = value.trim()
  for (const name of PREFECTURE_NAMES) {
    if (trimmed.startsWith(name)) {
      return name as keyof typeof PREFECTURE_CODE_BY_NAME
    }
  }
  return null
}

function extractDlFields(
  $: CheerioAPI,
): Map<string, { text: string; href: string | null }> {
  const fields = new Map<string, { text: string; href: string | null }>()
  $('dl').each((_, dl) => {
    let currentLabel: string | null = null
    $(dl)
      .children('dt, dd')
      .each((__, child) => {
        if (child.tagName === 'dt') {
          currentLabel = $(child).text().trim()
          return
        }
        if (child.tagName === 'dd' && currentLabel !== null) {
          fields.set(currentLabel, {
            text: $(child).text().trim(),
            href: $(child).find('a[href]').first().attr('href') ?? null,
          })
        }
      })
  })
  return fields
}

function extractPageParam(rawUrl: string): number | null {
  const url = new URL(rawUrl, 'https://www.michi-no-eki.jp')
  const pageText = url.searchParams.get('page')
  if (pageText === null) {
    return null
  }
  const page = Number(pageText)
  return Number.isInteger(page) && page >= 0 ? page : null
}

function normalizeHomepageUrl(value: string | null): string | null {
  if (value === null) {
    return null
  }
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function isJapanCoordinate(latitude: number, longitude: number): boolean {
  return (
    latitude >= JP_LAT_MIN &&
    latitude <= JP_LAT_MAX &&
    longitude >= JP_LON_MIN &&
    longitude <= JP_LON_MAX
  )
}
