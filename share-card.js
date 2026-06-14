// Encode/decode shareable verdict card payloads for the URL fragment.
// No DOM, no chrome APIs, unit-testable.

const VERSION = 1;

/**
 * Encode an analysis object into a URL-safe base64 fragment.
 * Only the fields needed for a readable card are included.
 */
export function encodeShareCard(data) {
  if (!data?.repoId) return '';
  const payload = {
    v: VERSION,
    r: String(data.repoId),
    d: String(data.description || '').slice(0, 140),
    h: Number(data.health?.score ?? data.health ?? 0),
    f: String(data.fitLevel || data.fit?.level || 'solid'),
    e: String(data.eli5 || '').slice(0, 120),
    l: String(data.license || ''),
    s: Number(data.stars || 0),
    la: String(data.language || ''),
  };
  try {
    return btoa(JSON.stringify(payload));
  } catch {
    return '';
  }
}

/**
 * Decode a fragment (with or without leading '#') back into a card payload.
 * Returns null if the fragment is invalid, missing, or has wrong version.
 */
export function decodeShareCard(hash) {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    const payload = JSON.parse(atob(raw));
    if (!payload?.r || payload.v !== VERSION) return null;
    return {
      repoId: String(payload.r),
      description: String(payload.d || ''),
      health: Number(payload.h || 0),
      fitLevel: String(payload.f || 'solid'),
      eli5: String(payload.e || ''),
      license: String(payload.l || ''),
      stars: Number(payload.s || 0),
      language: String(payload.la || ''),
    };
  } catch {
    return null;
  }
}
