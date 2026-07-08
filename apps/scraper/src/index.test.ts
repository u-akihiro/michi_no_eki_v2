import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractStationRefs } from './extract.js'
import { collectListRefs } from './index.js'

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
