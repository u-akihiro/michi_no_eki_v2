import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  StationSchema,
  StationsSchema,
  type Station,
} from '@michi-no-eki/shared'
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
const DEFAULT_MAX_RETRIES = 7
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000
const DEFAULT_RETRY_MAX_DELAY_MS = 30_000
const DEFAULT_EMPTY_LIST_MAX_RETRIES = 3
const DEFAULT_EMPTY_LIST_BACKOFF_MS = 500
const USER_AGENT =
  'michi-no-eki-v2-scraper/0.1 (+https://github.com/u-akihiro/michi_no_eki_v2)'

type CliOptions = {
  output: string
  limit: number | null
  delayMs: number
  allowMissingCoords: boolean
  fresh: boolean
}

type CollectListRefsOptions = {
  firstListHtml: string
  lastPage: number
  limit: number | null
  delayMs: number
  fetchListPage: (page: number) => Promise<string>
  sleepMs?: (ms: number) => Promise<void>
  logger?: (message: string) => void
  emptyListMaxRetries?: number
  emptyListBackoffMs?: number
}

type ScrapeStationDetailsOptions = {
  refs: StationRef[]
  output: string
  delayMs: number
  allowMissingCoords: boolean
  fresh: boolean
  fetchDetailPage: (ref: StationRef) => Promise<string>
  sleepMs?: (ms: number) => Promise<void>
  logger?: (message: string) => void
  warnLogger?: (message: string) => void
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const fetchOptions = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
    retryBaseDelayMs: DEFAULT_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs: DEFAULT_RETRY_MAX_DELAY_MS,
    userAgent: USER_AGENT,
  }

  console.log('fetching list page 0 to determine last page...')
  const firstListHtml = await fetchTextWithRetry(listUrl(0), fetchOptions)
  const lastPage = extractLastPage(firstListHtml)
  console.log(`last page: ${lastPage} (pages 0..${lastPage})`)

  const refs = await collectListRefs({
    firstListHtml,
    lastPage,
    limit: options.limit,
    delayMs: options.delayMs,
    fetchListPage: (page) => fetchTextWithRetry(listUrl(page), fetchOptions),
    sleepMs: sleep,
    logger: console.log,
  })

  await scrapeStationDetails({
    refs,
    output: options.output,
    delayMs: options.delayMs,
    allowMissingCoords: options.allowMissingCoords,
    fresh: options.fresh,
    fetchDetailPage: (ref) =>
      fetchTextWithRetry(`${BASE_URL}${ref.path}`, fetchOptions),
    sleepMs: sleep,
    logger: console.log,
    warnLogger: console.warn,
  })
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    output: DEFAULT_OUTPUT,
    limit: null,
    delayMs: DEFAULT_DELAY_MS,
    allowMissingCoords: false,
    fresh: false,
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
      case '--fresh':
        options.fresh = true
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

export async function collectListRefs(
  options: CollectListRefsOptions,
): Promise<StationRef[]> {
  const refs: StationRef[] = []
  const seen = new Set<number>()
  const sleepMs = options.sleepMs ?? sleep
  const logger = options.logger ?? (() => {})
  const emptyListMaxRetries =
    options.emptyListMaxRetries ?? DEFAULT_EMPTY_LIST_MAX_RETRIES
  const emptyListBackoffMs =
    options.emptyListBackoffMs ?? DEFAULT_EMPTY_LIST_BACKOFF_MS

  for (let page = 0; page <= options.lastPage; page += 1) {
    const pageRefs = await fetchNonEmptyListRefs({
      page,
      firstListHtml: options.firstListHtml,
      fetchListPage: options.fetchListPage,
      sleepMs,
      emptyListMaxRetries,
      emptyListBackoffMs,
    })
    let added = 0

    for (const ref of pageRefs) {
      if (seen.has(ref.sourceStationId)) {
        continue
      }
      seen.add(ref.sourceStationId)
      refs.push(ref)
      added += 1

      if (options.limit !== null && refs.length >= options.limit) {
        break
      }
    }

    logger(`list page ${page}: +${added} refs (total ${refs.length})`)

    if (options.limit !== null && refs.length >= options.limit) {
      break
    }
    if (page < options.lastPage) {
      await sleepMs(options.delayMs)
    }
  }

  return refs
}

export async function scrapeStationDetails(
  options: ScrapeStationDetailsOptions,
): Promise<Station[]> {
  const sleepMs = options.sleepMs ?? sleep
  const logger = options.logger ?? (() => {})
  const warnLogger = options.warnLogger ?? (() => {})
  const outputPath = resolve(options.output)
  const checkpointPath = checkpointPathForOutput(outputPath)

  await mkdir(dirname(outputPath), { recursive: true })
  if (options.fresh) {
    await rm(checkpointPath, { force: true })
  }

  const stationsBySourceId = await loadCheckpoint(checkpointPath)
  const missingCoords: string[] = []
  const skipped: string[] = []

  if (stationsBySourceId.size > 0) {
    logger(`loaded ${stationsBySourceId.size} checkpoint station(s)`)
  }

  for (const [index, ref] of options.refs.entries()) {
    if (stationsBySourceId.has(ref.sourceStationId)) {
      logger(
        `[${index + 1}/${options.refs.length}] skipped checkpointed ${ref.sourceStationId}`,
      )
      continue
    }

    const detailUrl = `${BASE_URL}${ref.path}`
    const html = await options.fetchDetailPage(ref)
    const detail = extractStationDetail(html, ref.prefectureName)
    for (const warning of detail.warnings) {
      warnLogger(`warning: ${detailUrl}: ${warning}`)
    }

    const built = buildStation(ref, detail)
    if (built.station === null) {
      const message = `${detailUrl}: ${built.errors.join(', ')}`
      if (built.errors.includes('missing valid map coordinates')) {
        missingCoords.push(message)
      } else {
        skipped.push(message)
      }
      warnLogger(`warning: skipping ${message}`)
    } else {
      stationsBySourceId.set(built.station.sourceStationId, built.station)
      await appendCheckpointStation(checkpointPath, built.station)
      logger(
        `[${index + 1}/${options.refs.length}] ${built.station.name} (${built.station.sourceStationId})`,
      )
    }

    if (index < options.refs.length - 1) {
      await sleepMs(options.delayMs)
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

  const stations = options.refs
    .map((ref) => stationsBySourceId.get(ref.sourceStationId))
    .filter((station): station is Station => station !== undefined)
  const validated = StationsSchema.parse(stations)
  await writeFile(outputPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8')
  await rm(checkpointPath, { force: true })
  logger(`wrote ${validated.length} station(s) to ${outputPath}`)
  return validated
}

function checkpointPathForOutput(outputPath: string): string {
  const extension = extname(outputPath)
  const name = basename(outputPath, extension)
  return join(dirname(outputPath), `${name}.checkpoint.jsonl`)
}

async function loadCheckpoint(path: string): Promise<Map<number, Station>> {
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return new Map()
    }
    throw error
  }

  const lines = content.split(/\r?\n/)
  const stations = new Map<number, Station>()
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') {
      continue
    }
    try {
      const station = StationSchema.parse(JSON.parse(line))
      stations.set(station.sourceStationId, station)
    } catch (error) {
      if (index === lines.length - 1) {
        break
      }
      throw error
    }
  }
  return stations
}

async function appendCheckpointStation(
  path: string,
  station: Station,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const file = await open(path, 'a')
  try {
    await file.write(`${JSON.stringify(station)}\n`, undefined, 'utf8')
    await file.sync()
  } finally {
    await file.close()
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

async function fetchNonEmptyListRefs(options: {
  page: number
  firstListHtml: string
  fetchListPage: (page: number) => Promise<string>
  sleepMs: (ms: number) => Promise<void>
  emptyListMaxRetries: number
  emptyListBackoffMs: number
}): Promise<StationRef[]> {
  for (let attempt = 0; attempt <= options.emptyListMaxRetries; attempt += 1) {
    const html =
      options.page === 0 && attempt === 0
        ? options.firstListHtml
        : await options.fetchListPage(options.page)
    const refs = extractStationRefs(html)
    if (refs.length > 0) {
      return refs
    }
    if (attempt < options.emptyListMaxRetries) {
      await options.sleepMs(options.emptyListBackoffMs * 2 ** attempt)
    }
  }

  throw new Error(
    `list page ${options.page} returned 0 station refs after ${options.emptyListMaxRetries + 1} attempt(s)`,
  )
}

function isCliEntrypoint(): boolean {
  const entrypoint = process.argv[1]
  return (
    entrypoint !== undefined && fileURLToPath(import.meta.url) === entrypoint
  )
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
