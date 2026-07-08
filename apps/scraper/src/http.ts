export type FetchOptions = {
  timeoutMs: number
  maxRetries: number
  userAgent: string
}

export async function fetchTextWithRetry(
  url: string,
  options: FetchOptions,
): Promise<string> {
  let lastError: unknown

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
    try {
      const response = await fetch(url, {
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
      await sleep(backoffMs(attempt))
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

function backoffMs(attempt: number): number {
  return 500 * 2 ** attempt
}
