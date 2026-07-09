import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchTextWithRetry } from './http.js'

describe('fetchTextWithRetry', () => {
  it('retries transient failures and returns a later success', async () => {
    let fetches = 0
    const delays: number[] = []

    const text = await fetchTextWithRetry('https://example.test/station', {
      timeoutMs: 1_000,
      maxRetries: 4,
      userAgent: 'test-agent',
      fetchImpl: () => {
        fetches += 1
        if (fetches < 3) {
          throw new Error('temporary network failure')
        }
        return Promise.resolve(new Response('ok'))
      },
      sleepMs: (ms) => {
        delays.push(ms)
        return Promise.resolve()
      },
    })

    assert.equal(text, 'ok')
    assert.equal(fetches, 3)
    assert.deepEqual(delays, [1_000, 2_000])
  })

  it('fails after the configured retry budget is exhausted', async () => {
    let fetches = 0
    const delays: number[] = []

    await assert.rejects(
      fetchTextWithRetry('https://example.test/station', {
        timeoutMs: 1_000,
        maxRetries: 2,
        userAgent: 'test-agent',
        fetchImpl: () => {
          fetches += 1
          throw new Error('network down')
        },
        sleepMs: (ms) => {
          delays.push(ms)
          return Promise.resolve()
        },
      }),
      /network down/,
    )

    assert.equal(fetches, 3)
    assert.deepEqual(delays, [1_000, 2_000])
  })

  it('clamps retry backoff to the configured maximum', async () => {
    const delays: number[] = []

    await assert.rejects(
      fetchTextWithRetry('https://example.test/station', {
        timeoutMs: 1_000,
        maxRetries: 3,
        retryBaseDelayMs: 10_000,
        retryMaxDelayMs: 30_000,
        userAgent: 'test-agent',
        fetchImpl: () => {
          throw new Error('network down')
        },
        sleepMs: (ms) => {
          delays.push(ms)
          return Promise.resolve()
        },
      }),
    )

    assert.deepEqual(delays, [10_000, 20_000, 30_000])
  })
})
