// retry.js — a tiny exponential-backoff wrapper for flaky network calls. `sleep`
// is injectable so backoff is instant and deterministic under test. Total tries
// = retries + 1; only errors for which isRetryable(err) is true are retried.

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @template T
 * @param {(attempt: number) => Promise<T>} fn
 * @param {{
 *   retries?: number,
 *   baseDelayMs?: number,
 *   factor?: number,
 *   maxDelayMs?: number,
 *   isRetryable?: (err: unknown) => boolean,
 *   sleep?: (ms: number) => Promise<void>,
 * }} [opts]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, {
  retries = 2,
  baseDelayMs = 500,
  factor = 2,
  maxDelayMs = 8000,
  isRetryable = () => true,
  sleep = defaultSleep,
} = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      const delay = Math.min(maxDelayMs, baseDelayMs * factor ** attempt);
      await sleep(delay);
      attempt += 1;
    }
  }
}
