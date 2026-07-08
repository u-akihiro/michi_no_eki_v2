import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import type { Station } from '@michi-no-eki/shared'
import { extractStationRefs, generateStationId } from './extract.js'
import { collectListRefs, scrapeStationDetails } from './index.js'

const refHtml = (sourceStationId: number): string => `
  <div class="searchList">
    <ul>
      <li>
        <a href="/stations/views/${sourceStationId}">
          <div class="txt">prefecture</div>
        </a>
      </li>
    </ul>
  </div>
`

describe('empty list pages', () => {
  it('extractStationRefs returns no refs for empty or linkless HTML', () => {
    assert.deepEqual(extractStationRefs(''), [])
    assert.deepEqual(
      extractStationRefs(
        '<div class="searchList"><p>No station links</p></div>',
      ),
      [],
    )
  })

  it('retries zero-ref list pages and fails clearly when they stay empty', async () => {
    let fetches = 0

    await assert.rejects(
      collectListRefs({
        firstListHtml: '',
        lastPage: 0,
        limit: null,
        delayMs: 0,
        emptyListMaxRetries: 2,
        emptyListBackoffMs: 0,
        fetchListPage: () => {
          fetches += 1
          return Promise.resolve('')
        },
        sleepMs: () => Promise.resolve(),
      }),
      /list page 0 returned 0 station refs after 3 attempt\(s\)/,
    )
    assert.equal(fetches, 2)
  })
})

describe('collectListRefs', () => {
  it('deduplicates refs across pages before applying limit', async () => {
    const refs = await collectListRefs({
      firstListHtml: refHtml(101),
      lastPage: 2,
      limit: 2,
      delayMs: 0,
      fetchListPage: (page) =>
        Promise.resolve(page === 1 ? refHtml(101) : refHtml(102)),
      sleepMs: () => Promise.resolve(),
    })

    assert.deepEqual(
      refs.map((ref) => ref.sourceStationId),
      [101, 102],
    )
  })
})

describe('scrapeStationDetails', () => {
  it('skips stations already present in the checkpoint and writes final output', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'michi-no-eki-scraper-'))
    const output = join(tempDir, 'stations.json')
    const checkpoint = join(tempDir, 'stations.checkpoint.jsonl')
    const checkpointStation: Station = {
      id: generateStationId(101),
      sourceStationId: 101,
      name: 'checkpointed station',
      prefectureCode: 1,
      address: 'checkpointed address',
      homepageUrl: null,
      latitude: 43.1,
      longitude: 141.1,
    }
    await writeFile(
      checkpoint,
      `${JSON.stringify(checkpointStation)}\n`,
      'utf8',
    )

    const fetchedIds: number[] = []
    const stations = await scrapeStationDetails({
      refs: [
        {
          path: '/stations/views/101',
          sourceStationId: 101,
          prefectureName: null,
        },
        {
          path: '/stations/views/102',
          sourceStationId: 102,
          prefectureName: null,
        },
      ],
      output,
      delayMs: 0,
      allowMissingCoords: false,
      fresh: false,
      fetchDetailPage: (ref) => {
        fetchedIds.push(ref.sourceStationId)
        return Promise.resolve(detailHtml('fresh station'))
      },
      sleepMs: () => Promise.resolve(),
    })

    assert.deepEqual(fetchedIds, [102])
    assert.deepEqual(
      stations.map((station) => station.sourceStationId),
      [101, 102],
    )

    const outputJson = JSON.parse(await readFile(output, 'utf8')) as Station[]
    assert.deepEqual(
      outputJson.map((station) => station.sourceStationId),
      [101, 102],
    )
    await assert.rejects(stat(checkpoint), /ENOENT/)
  })

  it('ignores an existing checkpoint when fresh is requested', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'michi-no-eki-scraper-'))
    const output = join(tempDir, 'stations.json')
    const checkpoint = join(tempDir, 'stations.checkpoint.jsonl')
    const checkpointStation: Station = {
      id: generateStationId(101),
      sourceStationId: 101,
      name: 'checkpointed station',
      prefectureCode: 1,
      address: 'checkpointed address',
      homepageUrl: null,
      latitude: 43.1,
      longitude: 141.1,
    }
    await writeFile(
      checkpoint,
      `${JSON.stringify(checkpointStation)}\n`,
      'utf8',
    )

    const fetchedIds: number[] = []
    await scrapeStationDetails({
      refs: [
        {
          path: '/stations/views/101',
          sourceStationId: 101,
          prefectureName: null,
        },
      ],
      output,
      delayMs: 0,
      allowMissingCoords: false,
      fresh: true,
      fetchDetailPage: (ref) => {
        fetchedIds.push(ref.sourceStationId)
        return Promise.resolve(detailHtml('fresh station'))
      },
      sleepMs: () => Promise.resolve(),
    })

    assert.deepEqual(fetchedIds, [101])
  })
})

function detailHtml(name: string): string {
  return `
    <dl>
      <dt>道の駅名</dt><dd>${name}</dd>
      <dt>所在地</dt><dd>068-2165 北海道三笠市岡山1056-1</dd>
    </dl>
    <iframe src="https://www.google.com/maps/embed/v1/place?q=43.2466006,141.8045499&key=abc"></iframe>
  `
}
