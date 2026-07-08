import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PREFECTURE_CODE_BY_NAME,
  STATION_ID_NAMESPACE,
  StationSchema,
} from '@michi-no-eki/shared'
import { v5 as uuidv5 } from 'uuid'
import {
  buildStation,
  extractDataBoxes,
  extractLastPage,
  extractMapCoords,
  extractSourceStationId,
  extractStationDetail,
  extractStationRefs,
  generateStationId,
  normalizeAddress,
} from './extract.js'

describe('extractMapCoords', () => {
  it('extracts q=lat,lng when query parameters are reordered', () => {
    const result = extractMapCoords(`
      <iframe src="https://www.google.com/maps/embed/v1/place?key=abc&q=36.1339762,137.1662097"></iframe>
    `)

    assert.deepEqual(result.coords, {
      latitude: 36.1339762,
      longitude: 137.1662097,
    })
    assert.deepEqual(result.warnings, [])
  })

  it('ignores non-map iframes and warns only on divergent map iframes', () => {
    const result = extractMapCoords(`
      <iframe src="https://www.googletagmanager.com/ns.html?id=GTM"></iframe>
      <iframe src="https://www.google.com/maps/embed/v1/place?q=35.1,139.1&key=abc"></iframe>
      <iframe src="https://www.google.com/maps/embed/v1/place?q=35.2,139.2&key=abc"></iframe>
    `)

    assert.deepEqual(result.coords, { latitude: 35.1, longitude: 139.1 })
    assert.equal(result.warnings.length, 1)
    assert.match(result.warnings[0] ?? '', /divergent/)
  })

  it('does not warn for duplicate matching map iframes', () => {
    const result = extractMapCoords(`
      <iframe src="https://www.google.com/maps/embed/v1/place?q=35.1,139.1&key=abc"></iframe>
      <iframe src="https://www.google.com/maps/embed/v1/place?q=35.1,139.1&key=abc"></iframe>
    `)

    assert.deepEqual(result.coords, { latitude: 35.1, longitude: 139.1 })
    assert.deepEqual(result.warnings, [])
  })

  it('treats out-of-Japan coordinates as missing', () => {
    const result = extractMapCoords(`
      <iframe src="https://www.google.com/maps/embed/v1/place?q=34.048072522450944,35.9624087621255&key=abc"></iframe>
    `)

    assert.equal(result.coords, null)
    assert.match(result.warnings[0] ?? '', /outside Japan range/)
  })

  it('does not match maps/embed as part of a larger path segment', () => {
    const result = extractMapCoords(`
      <iframe src="https://example.com/notmaps/embed/v1/place?q=35.1,139.1&key=abc"></iframe>
    `)

    assert.equal(result.coords, null)
  })
})

describe('list extraction', () => {
  const listHtml = `
    <div class="searchList">
      <ul>
        <li>
          <a href="/stations/views/18786">
            <h3>三笠</h3>
            <div class="txt">北海道 三笠市</div>
          </a>
        </li>
        <li>
          <a href="/stations/views/18787">
            <h3>スタープラザ\u3000芦別</h3>
            <div class="txt">北海道 芦別市</div>
          </a>
        </li>
      </ul>
    </div>
    <span class="last"><a href="/stations/search/all/all/all?page=34">最後 »</a></span>
    <div class="js-data-box" data-name="三笠" data-link="/stations/views/18786" data-lat="43.2466006" data-lng="141.8045499"></div>
  `

  it('extracts last page number', () => {
    assert.equal(extractLastPage(listHtml), 34)
  })

  it('extracts station refs and fallback prefecture from cards', () => {
    assert.deepEqual(extractStationRefs(listHtml), [
      {
        path: '/stations/views/18786',
        sourceStationId: 18786,
        prefectureName: '北海道',
      },
      {
        path: '/stations/views/18787',
        sourceStationId: 18787,
        prefectureName: '北海道',
      },
    ])
  })

  it('extracts data-box refs by data-link path', () => {
    assert.deepEqual(extractDataBoxes(listHtml), [
      {
        path: '/stations/views/18786',
        sourceStationId: 18786,
        prefectureName: null,
      },
    ])
  })
})

describe('detail extraction', () => {
  it('extracts dl fields, normalizes address, and maps prefecture code', () => {
    const detail = extractStationDetail(
      `
      <dl>
        <dt>道の駅名</dt><dd>スタープラザ\u3000芦別</dd>
        <dt>所在地</dt><dd>075-0014 北海道芦別市北４条東1-1</dd>
        <dt>ホームページ</dt><dd><a href="http://example.com/">公式</a></dd>
      </dl>
      <iframe src="https://www.google.com/maps/embed/v1/place?q=43.5255178,142.1888941&key=abc"></iframe>
    `,
      null,
    )

    assert.equal(detail.name, 'スタープラザ 芦別')
    assert.equal(detail.address, '北海道芦別市北4条東1-1')
    assert.equal(detail.homepageUrl, 'http://example.com/')
    assert.equal(detail.prefectureCode, 1)
    assert.deepEqual(detail.coords, {
      latitude: 43.5255178,
      longitude: 142.1888941,
    })
  })

  it('uses list prefecture fallback when address lacks a prefix', () => {
    const detail = extractStationDetail(
      `
      <dl>
        <dt>道の駅名</dt><dd>三笠</dd>
        <dt>所在地</dt><dd>三笠市岡山1056-1</dd>
      </dl>
      <iframe src="https://www.google.com/maps/embed/v1/place?q=43.2466006,141.8045499&key=abc"></iframe>
    `,
      '北海道',
    )

    assert.equal(detail.prefectureCode, 1)
    assert.equal(detail.homepageUrl, null)
  })

  it('normalizes Japanese postal codes and full-width ASCII', () => {
    assert.equal(
      normalizeAddress('〒１２３－４５６７　東京都千代田区１-２'),
      '東京都千代田区1-2',
    )
  })
})

describe('ids and schema', () => {
  it('extracts source station ID only from detail paths', () => {
    assert.equal(extractSourceStationId('/stations/views/18786'), 18786)
    assert.equal(
      extractSourceStationId(
        'https://www.michi-no-eki.jp/stations/views/18786',
      ),
      null,
    )
    assert.equal(extractSourceStationId('/stations/views/not-number'), null)
  })

  it('generates deterministic UUID v5 from station:{sourceStationId}', () => {
    assert.equal(
      generateStationId(18786),
      uuidv5('station:18786', STATION_ID_NAMESPACE),
    )
    assert.equal(generateStationId(18786), generateStationId(18786))
  })

  it('builds a Station compatible with the shared schema', () => {
    const detail = extractStationDetail(
      `
      <dl>
        <dt>道の駅名</dt><dd>三笠</dd>
        <dt>所在地</dt><dd>068-2165 北海道三笠市岡山1056-1</dd>
      </dl>
      <iframe src="https://www.google.com/maps/embed/v1/place?q=43.2466006,141.8045499&key=abc"></iframe>
    `,
      null,
    )
    const result = buildStation(
      {
        path: '/stations/views/18786',
        sourceStationId: 18786,
        prefectureName: '北海道',
      },
      detail,
    )

    assert.deepEqual(result.errors, [])
    assert.notEqual(result.station, null)
    assert.equal(StationSchema.safeParse(result.station).success, true)
  })

  it('uses manual coordinate override for source station 22788', () => {
    const mapCoords = extractMapCoords(`
      <iframe src="https://www.google.com/maps/embed/v1/place?q=34.048072522450944,35.9624087621255&key=abc"></iframe>
    `)
    const result = buildStation(
      {
        path: '/stations/views/22788',
        sourceStationId: 22788,
        prefectureName: '奈良県',
      },
      {
        name: 'きなりの郷 下北山',
        address: '奈良県吉野郡下北山村上池原1026番地',
        homepageUrl: null,
        prefectureCode: 29,
        coords: mapCoords.coords,
        warnings: mapCoords.warnings,
      },
    )

    assert.equal(mapCoords.coords, null)
    assert.deepEqual(result.errors, [])
    assert.ok(result.station)
    assert.equal(result.station.latitude, 34.048072522450944)
    assert.equal(result.station.longitude, 135.9624087621255)
    assert.equal(StationSchema.safeParse(result.station).success, true)
  })

  it('keeps missing-coordinate behavior for stations without an override', () => {
    const mapCoords = extractMapCoords(`
      <iframe src="https://www.google.com/maps/embed/v1/place?q=34.048072522450944,35.9624087621255&key=abc"></iframe>
    `)
    const result = buildStation(
      {
        path: '/stations/views/18786',
        sourceStationId: 18786,
        prefectureName: '奈良県',
      },
      {
        name: 'override対象外',
        address: '奈良県吉野郡下北山村上池原1026番地',
        homepageUrl: null,
        prefectureCode: 29,
        coords: mapCoords.coords,
        warnings: mapCoords.warnings,
      },
    )

    assert.equal(result.station, null)
    assert.deepEqual(result.errors, ['missing valid map coordinates'])
  })

  it('keeps prefecture code constants aligned with JIS codes', () => {
    assert.equal(PREFECTURE_CODE_BY_NAME.北海道, 1)
    assert.equal(PREFECTURE_CODE_BY_NAME.沖縄県, 47)
  })
})
