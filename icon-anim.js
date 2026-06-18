// icon-anim.js — toolbar icon animation, for the active-scan state only.
//
// The installed icon is a static PNG (manifest). While a scan runs, the service
// worker pushes animated frames via chrome.action.setIcon({ tabId, imageData }),
// then resets to the static path icon when the scan finishes or errors.
//
// No requestAnimationFrame in a worker — a setTimeout loop ticks ~every TICK_MS.
// The per-frame math (scanFrameParams) is pure and unit-tested; the timer and
// canvas/setIcon glue are verified live in the loaded extension.
//
// Respect: startScanAnim no-ops when animateIcon is off OR reduced motion is set
// (both read from chrome.storage.local), and when there is no tabId.

import { drawVeeIcon } from './icon-draw.js';

/** Sizes Chrome needs for the action icon imageData map. */
export const ANIM_SIZES = [16, 32, 48];

const TICK_MS = 90; // frame interval (worker-friendly)
const GROW_MS = 600; // aperture grow-in duration
const MAX_RUN_MS = 90_000; // safety cap: never animate longer than this
const STATIC_PATH = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};

export const RING_GREY = '#cbd5e1';
export const RING_BLUE = '#3b82f6';

/** Clamp helper. */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Linear blend of two hex colors → rgb() string. t in [0,1]. */
function mixHex(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
}

/**
 * Pure: the draw opts for a given elapsed time.
 * @param {number} elapsedMs ms since scan start
 * @returns {{apertureScale:number, apertureRotation:number, ringScale:number, ringColor:string, dashed:boolean}}
 */
export function scanFrameParams(elapsedMs) {
  const t = Math.max(0, elapsedMs);

  // Aperture grow-in with a slight overshoot, then settle at 1.0.
  let apertureScale;
  if (t < GROW_MS) {
    const p = t / GROW_MS; // 0 → 1
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    apertureScale = 0.5 + (1.1 - 0.5) * eased; // 0.5 → 1.1 (overshoot)
  } else {
    const settle = clamp((t - GROW_MS) / 200, 0, 1);
    apertureScale = 1.1 - 0.1 * settle; // 1.1 → 1.0
  }

  // Spin accelerates: angle grows with the square of time-after-grow.
  const spinT = Math.max(0, t - GROW_MS) / 1000; // seconds spinning
  const apertureRotation = 0.6 * spinT * spinT; // rad; quadratic = slow → fast

  // Ring breathe: gentle sinusoid for both scale and grey→blue blend.
  const phase = (t % 2400) / 2400; // 2.4s loop
  const wave = (1 - Math.cos(phase * Math.PI * 2)) / 2; // 0 → 1 → 0
  const ringScale = 1.0 + 0.08 * wave;
  const ringColor = mixHex(RING_GREY, RING_BLUE, wave);

  return { apertureScale, apertureRotation, ringScale, ringColor, dashed: true };
}

// ─── Impure timer + setIcon glue (verified live, not unit-tested) ─────────────

const timers = new Map(); // tabId → { id, started }

async function shouldAnimate() {
  try {
    const { animateIcon, reduceMotion } = await chrome.storage.local.get(['animateIcon', 'reduceMotion']);
    if (animateIcon === false) return false; // default ON
    if (reduceMotion === true) return false;
    return true;
  } catch {
    return false; // storage unavailable → stay static
  }
}

function renderImageData(elapsedMs) {
  const params = scanFrameParams(elapsedMs);
  const imageData = {};
  for (const size of ANIM_SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawVeeIcon(ctx, size, params);
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  return imageData;
}

/**
 * Begin animating the toolbar icon for one tab's active scan.
 * No-ops when disabled, under reduced motion, or without a tabId.
 * @param {number|undefined} tabId
 */
export async function startScanAnim(tabId) {
  if (typeof tabId !== 'number') return;
  if (timers.has(tabId)) return; // already animating this tab
  if (!(await shouldAnimate())) return;

  const started = Date.now();
  const tick = () => {
    const elapsed = Date.now() - started;
    if (elapsed > MAX_RUN_MS) {
      stopScanAnim(tabId);
      return;
    }
    try {
      chrome.action.setIcon({ tabId, imageData: renderImageData(elapsed) }).catch(() => {});
    } catch {
      /* tab gone / OffscreenCanvas unavailable — stop quietly */ stopScanAnim(tabId);
      return;
    }
    const id = setTimeout(tick, TICK_MS);
    const entry = timers.get(tabId);
    if (entry) entry.id = id;
    else {
      clearTimeout(id);
    }
  };

  timers.set(tabId, { id: 0, started });
  tick();
}

/**
 * Stop animating a tab and reset it to the static path icon.
 * Safe to call when no animation is running.
 * @param {number|undefined} tabId
 */
export function stopScanAnim(tabId) {
  if (typeof tabId !== 'number') return;
  const entry = timers.get(tabId);
  if (entry) {
    clearTimeout(entry.id);
    timers.delete(tabId);
  }
  try {
    chrome.action.setIcon({ tabId, path: STATIC_PATH }).catch(() => {});
  } catch {
    /* tab gone */
  }
}
