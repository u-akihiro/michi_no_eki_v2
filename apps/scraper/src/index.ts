import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { StationsSchema, type Station } from '@michi-no-eki/shared'
import {
  buildStation,
  extractLastPage,
  extractStationDetail,
  extractStationRefs,
  type StationRef,
} from './extract.js'
import { fetchTextWithRetry, sleep } from './http.js'

const BASE_URL = 'https://www.michi-no-eki.jp'
const DEFAULT_OUTPUT = 'output/stations.json'
const DEFAULT_DELAY_MS = 1000
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_RETRIES = 3
const USER_AGENT =
  'michi-no-eki-v2-scraper/0.1 (+https://github.com/u-akihiro/michi_no_eki_v2)'

type CliOptions = {
  output: string
  limit: number | null
  delayMs: number
  allowMissingCoords: boolean
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const fetchOptions = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
    userAgent: USER_AGENT,
  }

  console.log('fetching list page 0 to determine last page...')
  const firstListHtml = await fetchTextWithRetry(listUrl(0), fetchOptions)
  const lastPage = extractLastPage(firstListHtml)
  console.log(`last page: ${lastPage} (pages 0..${lastPage})`)

  const refs: StationRef[] = []
  for (let page = 0; page <= lastPage; page += 1) {
    const html =
      page === 0
        ? firstListHtml
        : await fetchTextWithRetry(listUrl(page), fetchOptions)
    refs.push(...extractStationRefs(html))
    console.log(
      `list page ${page}: collected ${refs.length} detail refs so far`,
    )
    if (options.limit !== null && refs.length >= options.limit) {
      refs.length = options.limit
      break
    }
    if (page < lastPage) {
      await sleep(options.delayMs)
    }
  }

  const stations: Station[] = []
  const missingCoords: string[] = []
  const skipped: string[] = []

  for (const [index, ref] of refs.entries()) {
    const detailUrl = `${BASE_URL}${ref.path}`
    const html = await fetchTextWithRetry(detailUrl, fetchOptions)
    const detail = extractStationDetail(html, ref.prefectureName)
    for (const warning of detail.warnings) {
      console.warn(`warning: ${detailUrl}: ${warning}`)
    }

    const built = buildStation(ref, detail)
    if (built.station === null) {
      const message = `${detailUrl}: ${built.errors.join(', ')}`
      if (built.errors.includes('missing valid map coordinates')) {
        missingCoords.push(message)
      } else {
        skipped.push(message)
      }
      console.warn(`warning: skipping ${message}`)
    } else {
      stations.push(built.station)
      console.log(
        `[${index + 1}/${refs.length}] ${built.station.name} (${built.station.sourceStationId})`,
      )
    }

    if (index < refs.length - 1) {
      await sleep(options.delayMs)
    }
  }

  if (missingCoords.length > 0 && !options.allowMissingCoords) {
    throw new Error(
      `${missingCoords.length} station(s) lack valid iframe coordinates:\n${missingCoords.join('\n')}`,
    )
  }
  if (skipped.length > 0) {
    throw new Error(
      `${skipped.length} station(s) could not be extracted:\n${skipped.join('\n')}`,
    )
  }

  const validated = StationsSchema.parse(stations)
  const outputPath = resolve(options.output)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8')
  console.log(`wrote ${validated.length} station(s) to ${outputPath}`)
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    output: DEFAULT_OUTPUT,
    limit: null,
    delayMs: DEFAULT_DELAY_MS,
    allowMissingCoords: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    switch (arg) {
      case '--output':
        options.output = readValue(args, index, arg)
        index += 1
        break
      case '--limit':
        options.limit = parsePositiveInteger(readValue(args, index, arg), arg)
        index += 1
        break
      case '--delay-ms':
        options.delayMs = parseNonNegativeInteger(
          readValue(args, index, arg),
          arg,
        )
        index += 1
        break
      case '--allow-missing-coords':
        options.allowMissingCoords = true
        break
      default:
        throw new Error(`unknown argument: ${arg ?? ''}`)
    }
  }

  return options
}

function readValue(args: string[], index: number, name: string): string {
  const value = args[index + 1]
  if (value === undefined) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function parseNonNegativeInteger(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return parsed
}

function listUrl(page: number): string {
  return `${BASE_URL}/stations/search/all/all/all?page=${page}`
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
