// Minimal Anthropic Messages API call for the MCP server. The key comes from the
// environment (ANTHROPIC_API_KEY) — never chrome.storage, never a hosted backend —
// so the server stays local and bring-your-own-key. Mirrors the extension's
// callAnthropic shape (background.js): same endpoint, version header, and default model.

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * @param {string} prompt - the fully-assembled analysis prompt.
 * @returns {Promise<string>} the model's text response.
 */
export async function callAnthropic(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set in the environment');
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.ANTHROPIC_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  // Hard timeout so a stalled connection can't hang the tool call forever
  // (mirrors the extension's per-provider timeout in background.js).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Anthropic request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('').trim();
  if (!text) throw new Error('Anthropic returned an empty response');
  return text;
}
