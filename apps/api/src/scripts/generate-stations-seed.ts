import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { StationsSchema, type Station } from '@michi-no-eki/shared'

const DEFAULT_INPUT = '../scraper/output/stations.json'
const DEFAULT_OUTPUT = 'drizzle/seed/stations.sql'

type CliOptions = {
  input: string
  output: string
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--input') {
      const value = args[index + 1]
      if (value === undefined) {
        throw new Error('--input requires a path')
      }
      options.input = value
      index += 1
      continue
    }

    if (arg === '--output') {
      const value = args[index + 1]
      if (value === undefined) {
        throw new Error('--output requires a path')
      }
      options.output = value
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function findDuplicates<T>(items: T[], getKey: (item: T) => string): string[] {
  const counts = new Map<string, number>()

  for (const item of items) {
    const key = getKey(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => `${key} (${count} times)`)
}

function assertNoDuplicateKeys(stations: Station[]): void {
  const duplicateIds = findDuplicates(stations, (station) => station.id)
  const duplicateSourceStationIds = findDuplicates(stations, (station) =>
    station.sourceStationId.toString(),
  )

  const messages = [
    duplicateIds.length > 0
      ? `Duplicate station id values: ${duplicateIds.join(', ')}`
      : null,
    duplicateSourceStationIds.length > 0
      ? `Duplicate sourceStationId values: ${duplicateSourceStationIds.join(', ')}`
      : null,
  ].filter((message) => message !== null)

  if (messages.length > 0) {
    throw new Error(messages.join('\n'))
  }
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function sqlNullableText(value: string | null): string {
  return value === null ? 'NULL' : sqlText(value)
}

function sqlNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid SQL number: ${value}`)
  }

  return value.toString()
}

function toInsertStatement(station: Station, seedTime: number): string {
  const values = [
    sqlText(station.id),
    sqlNumber(station.sourceStationId),
    sqlNumber(station.prefectureCode),
    sqlText(station.name),
    sqlText(station.address),
    sqlNullableText(station.homepageUrl),
    sqlNumber(station.latitude),
    sqlNumber(station.longitude),
    sqlNumber(seedTime),
    sqlNumber(seedTime),
  ].join(', ')

  return [
    'INSERT INTO stations (id, source_station_id, prefecture_code, name, address, homepage_url, latitude, longitude, created_at, updated_at)',
    `VALUES (${values})`,
    'ON CONFLICT(id) DO UPDATE SET',
    'source_station_id = excluded.source_station_id,',
    'prefecture_code = excluded.prefecture_code,',
    'name = excluded.name,',
    'address = excluded.address,',
    'homepage_url = excluded.homepage_url,',
    'latitude = excluded.latitude,',
    'longitude = excluded.longitude,',
    'updated_at = excluded.updated_at;',
  ].join(' ')
}

function formatZodError(error: {
  issues: Array<{ path: Array<PropertyKey>; message: string }>
}): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      return `${path}: ${issue.message}`
    })
    .join('\n')
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const inputPath = resolve(options.input)
  const outputPath = resolve(options.output)
  const jsonText = await readFile(inputPath, 'utf8')
  const parsed: unknown = JSON.parse(jsonText)
  const result = StationsSchema.safeParse(parsed)

  if (!result.success) {
    throw new Error(`Invalid stations JSON:\n${formatZodError(result.error)}`)
  }

  assertNoDuplicateKeys(result.data)

  const seedTime = Math.floor(Date.now() / 1000)
  const sql = `${result.data
    .map((station) => toInsertStatement(station, seedTime))
    .join('\n')}\n`

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, sql, 'utf8')

  console.log(
    `wrote ${result.data.length} station seed statement(s) to ${outputPath}`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
