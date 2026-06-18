// Synthesizes a one-glance "verdict" from an existing analysis. Pure + deterministic so the
// fit chip works on every already-analyzed repo with no AI call. Used by the Verdict landing.
import { formatStars } from './format.js';

/** The first sentence of a blob (for the one-line "what it is"); '' when empty. */
export function firstSentence(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).trim();
}

/**
 * Derive a fit verdict from health score, red-flag count, and pros/cons balance.
 * @returns {{ level: 'strong'|'solid'|'care'|'risky', label: string, why: string }}
 */
export function deriveFit(d) {
  const score = Number(d && d.health && d.health.score);
  const hasScore = Number.isFinite(score) && score > 0;
  const warns = ((d && d.red_flags) || []).filter((f) => f && f.severity !== 'ok').length;
  const pros = ((d && d.pros) || []).length;
  const cons = ((d && d.cons) || []).length;

  let level;
  if (hasScore) {
    if (score >= 85 && warns === 0) level = 'strong';
    else if (score >= 70 && warns <= 1) level = 'solid';
    else if (score >= 50 && warns <= 3) level = 'care';
    else level = 'risky';
  } else if (warns === 0 && pros >= cons) {
    level = 'solid';
  } else if (warns <= 2) {
    level = 'care';
  } else {
    level = 'risky';
  }

  const label = { strong: 'Strong fit', solid: 'Solid', care: 'Use with care', risky: 'Risky' }[level];
  const bits = [];
  if (hasScore) bits.push(`Health ${score}`);
  bits.push(`${warns} flag${warns === 1 ? '' : 's'}`);
  if (pros || cons) bits.push(`${pros} pros / ${cons} cons`);
  return { level, label, why: bits.join(' · ') };
}

/** A plain-text verdict summary for the clipboard — title, meta, what-it-is, pros/cons, flags. */
export function verdictCopyText(d) {
  const fit = deriveFit(d);
  const what = (d && d.description) || firstSentence(d && d.eli5) || '';
  const score = d?.health?.score;
  const starStr = formatStars(d?.stars);

  const lines = [`${(d && d.repoId) || (d && d.name) || 'Repository'} — ${fit.label}`];

  const meta = [
    score != null ? `Health ${score}/100` : null,
    starStr ? `${starStr} ★` : null,
    d?.license && d.license !== 'Unknown' ? d.license : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (meta) lines.push(meta);

  if (what) lines.push('', what);
  if (d && d.bottom_line) lines.push('', d.bottom_line);

  const pros = ((d && d.pros) || []).slice(0, 2);
  const cons = ((d && d.cons) || []).slice(0, 2);
  if (pros.length || cons.length) {
    lines.push('');
    if (pros.length) lines.push(...pros.map((p) => `+ ${p}`));
    if (cons.length) lines.push(...cons.map((c) => `- ${c}`));
  }

  const warns = ((d && d.red_flags) || []).filter((f) => f && f.severity !== 'ok').slice(0, 3);
  if (warns.length) {
    lines.push('', 'Flags:', ...warns.map((f) => `⚠ ${f.title}: ${f.text}`));
  }
  return lines.join('\n').trim();
}
