// Pure presentation helpers (no DOM / chrome dependencies) so they can be unit-tested.

/** HTML-escape a value for safe insertion via innerHTML. */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render text that may contain multiple paragraphs (blank-line separated) as
 * real <p> blocks instead of one collapsed wall of text. Single newlines within
 * a paragraph become <br>.
 */
export function paras(text, cls) {
  const blocks = String(text ?? '').trim().split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  return blocks.map(b => `<p class="${cls}">${esc(b).replace(/\n/g, '<br>')}</p>`).join('');
}

/** Compact, accurate star count: 850 → "850", 1234 → "1.2k", 15000 → "15k", 1.2M. */
export function formatStars(n) {
  if (!n || n < 1) return null;
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return (k < 10 ? k.toFixed(1).replace(/\.0$/, '') : String(Math.round(k))) + 'k';
  }
  const m = n / 1_000_000;
  return (m < 10 ? m.toFixed(1).replace(/\.0$/, '') : String(Math.round(m))) + 'M';
}
