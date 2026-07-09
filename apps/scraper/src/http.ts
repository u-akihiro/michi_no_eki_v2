export type FetchOptions = {
  timeoutMs: number
  maxRetries: number
  userAgent: string
  retryBaseDelayMs?: number
  retryMaxDelayMs?: number
  fetchImpl?: typeof fetch
  sleepMs?: (ms: number) => Promise<void>
}

export async function fetchTextWithRetry(
  url: string,
  options: FetchOptions,
): Promise<string> {
  let lastError: unknown
  const fetchImpl = options.fetchImpl ?? fetch
  const sleepMs = options.sleepMs ?? sleep

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
    try {
      const response = await fetchImpl(url, {
        headers: { 'user-agent': options.userAgent },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt === options.maxRetries) {
        break
      }
      await sleepMs(backoffMs(attempt, options))
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function backoffMs(attempt: number, options: FetchOptions): number {
  const baseDelayMs = options.retryBaseDelayMs ?? 1_000
  const maxDelayMs = options.retryMaxDelayMs ?? 30_000
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
}
