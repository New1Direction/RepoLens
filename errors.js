// errors.js — turn raw provider failures into one actionable message and decide
// what's worth retrying. Pure + heuristic: works off an Error/string or a
// structured { status, message }, so the provider call functions don't have to
// change how they throw. The fallback chain used to dump every provider's raw
// error joined by " · "; this surfaces the single most fixable one instead.

const KIND_META = {
  none:        { retryable: false, fixable: true,  priority: 6 },
  auth:        { retryable: false, fixable: true,  priority: 5 },
  not_found:   { retryable: false, fixable: true,  priority: 4 },
  bad_request: { retryable: false, fixable: true,  priority: 3 },
  rate_limit:  { retryable: true,  fixable: false, priority: 2 },
  server:      { retryable: true,  fixable: false, priority: 1 },
  network:     { retryable: true,  fixable: false, priority: 1 },
  unknown:     { retryable: false, fixable: false, priority: 0 },
};

function messageOf(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || '';
  if (typeof err === 'object') return err.message || '';
  return String(err);
}

function statusOf(err) {
  if (err && typeof err === 'object' && Number.isFinite(err.status)) return err.status;
  const m = messageOf(err).match(/\b(4\d\d|5\d\d)\b/);
  return m ? Number(m[1]) : 0;
}

function humanize(kind, provider, fallback) {
  const who = provider || 'This provider';
  switch (kind) {
    case 'none': return 'No AI provider connected — open Settings to add a key.';
    case 'auth': return `${who}’s credential was rejected — check or reconnect it in Settings.`;
    case 'rate_limit': return `${who} is rate-limited — wait a moment, or route this part to another provider.`;
    case 'not_found': return `${who} didn’t recognize that model — pick a valid model in Settings.`;
    case 'server': return `${who} is temporarily unavailable — retried and still failing. Try again shortly.`;
    case 'network': return `Couldn’t reach ${provider || 'the provider'} — check your connection and retry.`;
    case 'bad_request': return fallback || `${who} rejected the request as malformed.`;
    default: return fallback || 'Something went wrong with the AI request.';
  }
}

/**
 * Classify a provider error and produce a human, actionable message.
 * @param {unknown} err Error, string, or { status, message }
 * @param {string} [provider] Display name for the provider (e.g. "Anthropic")
 * @returns {{ kind: string, retryable: boolean, fixable: boolean, priority: number, userMessage: string }}
 */
export function categorizeError(err, provider = '') {
  const msg = messageOf(err);
  const low = msg.toLowerCase();
  const status = statusOf(err);
  let kind = 'unknown';

  if (/no ai provider configured|open settings to connect one/i.test(msg)) kind = 'none';
  else if (status === 401 || status === 403 || /\bexpired\b|invalid .*key|unauthor|forbidden|reconnect|no .* credential|add a key/i.test(low)) kind = 'auth';
  else if (status === 429 || /rate.?limit|too many requests|quota/i.test(low)) kind = 'rate_limit';
  else if (status === 404 || /not found|unknown model|no such model|does not exist/i.test(low)) kind = 'not_found';
  else if (status >= 500 || /server error|unavailable|bad gateway|gateway timeout|overloaded/i.test(low)) kind = 'server';
  else if (status === 400 || /bad request|invalid request/i.test(low)) kind = 'bad_request';
  else if (/network|failed to fetch|fetch failed|timeout|timed out|connection refused/i.test(low)) kind = 'network';

  const meta = KIND_META[kind];
  return { kind, retryable: meta.retryable, fixable: meta.fixable, priority: meta.priority, userMessage: humanize(kind, provider, msg) };
}

/**
 * From a list of attempt failures, surface the single most actionable message.
 * Fixable issues (bad key, wrong model) outrank transient ones, since those are
 * what the user can act on. Each item: { provider?, error?|message? } or a raw error.
 * @param {Array<{provider?: string, error?: unknown, message?: string}>} items
 * @returns {{ kind: string, userMessage: string }}
 */
export function rankErrors(items) {
  const list = items || [];
  if (!list.length) return { kind: 'none', userMessage: 'No AI provider connected — open Settings to add a key.' };
  const infos = list.map((it) => {
    const provider = (it && it.provider) || '';
    const err = it && (it.error ?? it.message) !== undefined ? (it.error ?? it.message) : it;
    return categorizeError(err, provider);
  });
  infos.sort((a, b) => b.priority - a.priority);
  return infos[0];
}
