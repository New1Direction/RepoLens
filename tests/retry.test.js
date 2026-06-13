import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../retry.js';

const noSleep = () => Promise.resolve();

describe('withRetry', () => {
  it('returns the first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await withRetry(fn, { sleep: noSleep })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable failure and then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce('ok');
    expect(await withRetry(fn, { sleep: noSleep })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after retries+1 attempts and throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));
    await expect(withRetry(fn, { retries: 2, sleep: noSleep })).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('does not retry when isRetryable is false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401'));
    await expect(withRetry(fn, { isRetryable: () => false, sleep: noSleep })).rejects.toThrow('401');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff delays', async () => {
    const delays = [];
    const sleep = (ms) => { delays.push(ms); return Promise.resolve(); };
    const fn = vi.fn().mockRejectedValue(new Error('503'));
    await expect(withRetry(fn, { retries: 3, baseDelayMs: 100, factor: 2, sleep })).rejects.toThrow();
    expect(delays).toEqual([100, 200, 400]);
  });

  it('caps the delay at maxDelayMs', async () => {
    const delays = [];
    const sleep = (ms) => { delays.push(ms); return Promise.resolve(); };
    const fn = vi.fn().mockRejectedValue(new Error('503'));
    await expect(withRetry(fn, { retries: 4, baseDelayMs: 1000, factor: 10, maxDelayMs: 5000, sleep })).rejects.toThrow();
    expect(delays.every((d) => d <= 5000)).toBe(true);
  });

  it('passes the attempt index to fn', async () => {
    const seen = [];
    const fn = vi.fn(async (attempt) => { seen.push(attempt); if (attempt < 2) throw new Error('retry'); return 'done'; });
    expect(await withRetry(fn, { retries: 3, sleep: noSleep })).toBe('done');
    expect(seen).toEqual([0, 1, 2]);
  });
});
