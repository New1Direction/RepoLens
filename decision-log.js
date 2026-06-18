// Decision Log — pure functions for recording and validating adoption decisions.
// No DOM, no storage: the persistence glue lives in store.js. Fully testable.

export const DECISIONS = ['adopt', 'trial', 'hold', 'reject'];

export const DECISION_META = {
  adopt: { label: 'Adopt', color: 'var(--ok-ink)', bg: 'var(--ok-bg)', border: 'var(--ok-edge)' },
  trial: { label: 'Trial', color: '#60a5fa', bg: 'rgba(59,130,246,.1)', border: 'rgba(59,130,246,.35)' },
  hold: { label: 'Hold', color: 'var(--warn-ink)', bg: 'var(--warn-bg)', border: 'var(--warn-edge)' },
  reject: { label: 'Reject', color: 'var(--bad-ink)', bg: 'var(--bad-bg)', border: 'var(--bad-edge)' },
};

/**
 * Build a decision record. Returns a new immutable object — never mutates input.
 * @param {{ repoId: string, decision: string, note?: string, timestamp?: string }} opts
 */
export function buildDecision({ repoId, decision, note = '', timestamp }) {
  if (!repoId) throw new Error('Decision needs a repoId');
  if (!DECISIONS.includes(decision))
    throw new Error(`Invalid decision: "${decision}". Must be one of: ${DECISIONS.join(', ')}`);
  return {
    repoId: String(repoId),
    decision,
    note: String(note || '').trim(),
    timestamp: timestamp || new Date().toISOString(),
  };
}

/**
 * Validate and normalize a raw decision object from storage or import.
 * Returns the normalized record or null if it is irreparably invalid.
 */
export function normalizeDecision(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const repoId = String(raw.repoId || '').trim();
  if (!repoId) return null;
  const decision = DECISIONS.includes(raw.decision) ? raw.decision : null;
  if (!decision) return null;
  return {
    repoId,
    decision,
    note: String(raw.note || '').trim(),
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString(),
  };
}

/** True if the record has the minimum required fields. */
export function isValidDecision(raw) {
  return normalizeDecision(raw) !== null;
}
