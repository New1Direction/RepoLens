// snapshots.js — pure helpers for the Scan Ledger: turn a repo payload into a
// trimmed snapshot, maintain a capped per-repo history, and derive a trend +
// sparkline. No DOM, no chrome, no IndexedDB — fully unit-testable.

import { deriveFit } from './verdict.js';
import { FIT_ORDER } from './diff-analysis.js';

export const SNAPSHOT_CAP = 30;

/** Normalize a payload's health (number or { score }) to a finite number or null. */
function snapHealth(payload) {
  const h = payload && payload.health;
  const n = Number(h && typeof h === 'object' ? h.score : h);
  return Number.isFinite(n) ? n : null;
}

/**
 * Trim a repo payload to a Snapshot. `ts` is injectable for deterministic tests;
 * it defaults to the payload's saved_at, then now.
 * No `version` field: the persisted repo payload never carries one in-app, so it
 * was always null — omitted rather than stored. Old snaps that still have it read
 * back fine (snapshotTrend ignores the field).
 * @returns {{ ts:string, health:number|null, fit:string, stars:number, flags:string[] }}
 */
export function toSnapshot(payload, ts) {
  const health = snapHealth(payload);
  const fit = deriveFit({
    health: { score: health },
    red_flags: (payload && payload.red_flags) || [],
    pros: (payload && payload.pros) || [],
    cons: (payload && payload.cons) || [],
  }).level;
  return {
    ts: ts || (payload && payload.saved_at) || new Date().toISOString(),
    health,
    fit,
    stars: Number(payload && payload.stars) || 0,
    flags: ((payload && payload.red_flags) || []).map((f) => f && f.title).filter(Boolean),
  };
}

/** Append a snapshot immutably, keeping only the most recent `cap`. */
export function appendSnapshot(snaps, snap, cap = SNAPSHOT_CAP) {
  const next = [...(Array.isArray(snaps) ? snaps : []), snap];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Direction of a fit change: 'up' (improved), 'down' (worse), 'same'. Lower index = better. */
function fitDirection(from, to) {
  const a = FIT_ORDER.indexOf(from);
  const b = FIT_ORDER.indexOf(to);
  if (a < 0 || b < 0 || a === b) return 'same';
  return b < a ? 'up' : 'down';
}

/**
 * Derive a trend from a snapshot list (oldest→newest). Returns null if <2 points.
 * @returns {null | { count, series, first, latest, healthDelta, fitFrom, fitTo,
 *   fitDirection, flagsResolved, flagsNew, daysSpan }}
 */
export function snapshotTrend(snaps) {
  const list = (Array.isArray(snaps) ? snaps : []).filter((s) => s && s.ts);
  if (list.length < 2) return null;
  const first = list[0];
  const latest = list[list.length - 1];
  const series = list.map((s) => ({ ts: s.ts, health: s.health, fit: s.fit, stars: s.stars }));
  const healthDelta = first.health != null && latest.health != null ? latest.health - first.health : null;
  // Coerce defensively: a corrupt/hostile backup can pass the envelope-only
  // validateBackup with a non-array `flags` (e.g. flags:5), and `new Set(5)` throws.
  const firstFlags = new Set(Array.isArray(first.flags) ? first.flags : []);
  const latestFlags = new Set(Array.isArray(latest.flags) ? latest.flags : []);
  return {
    count: list.length,
    series,
    first,
    latest,
    healthDelta,
    fitFrom: first.fit,
    fitTo: latest.fit,
    fitDirection: fitDirection(first.fit, latest.fit),
    flagsResolved: [...firstFlags].filter((t) => !latestFlags.has(t)),
    flagsNew: [...latestFlags].filter((t) => !firstFlags.has(t)),
    daysSpan: Math.max(0, Math.round((Date.parse(latest.ts) - Date.parse(first.ts)) / 86_400_000)),
  };
}

/**
 * Build an inline-SVG sparkline string from a trend series. Plots `metric`
 * (default 'health'), skipping null points. Returns null if <2 plottable points.
 */
export function sparkline(
  series,
  { metric = 'health', width = 120, height = 32, stroke = 'currentColor' } = {}
) {
  const all = Array.isArray(series) ? series : [];
  const pts = all
    .map((s, i) => {
      const raw = s ? s[metric] : undefined;
      return { i, v: raw == null ? NaN : Number(raw) }; // null/undefined are not plottable (Number(null)===0)
    })
    .filter((p) => Number.isFinite(p.v));
  if (pts.length < 2) return null;
  const n = all.length;
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * width);
  const y = (v) => height - ((v - min) / span) * height;
  const coords = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`);
  const last = pts[pts.length - 1];
  return (
    `<svg class="rl-spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" aria-hidden="true">` +
    `<polyline points="${coords.join(' ')}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${x(last.i).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="2.4" fill="${stroke}"/>` +
    `</svg>`
  );
}
