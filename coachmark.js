// coachmark.js
// DOM coachmark tour: a dimming veil, a spotlight around a target element, a card
// (with Vee) anchored beside it, Back/Next/Skip + keyboard. No deps, MV3-safe.
import { renderMascot, setMascotState } from './mascot.js';

const GAP = 12, MARGIN = 8;

/** Pure: where to put the card relative to a target rect (or center if null). */
export function placeCard(rect, card, vp) {
  if (!rect) return { side: 'center', left: (vp.w - card.w) / 2, top: (vp.h - card.h) / 2 };
  const below = rect.y + rect.height + GAP, above = rect.y - GAP - card.h;
  const side = (below + card.h <= vp.h) ? 'below' : (above >= 0 ? 'above' : 'below');
  const top = side === 'below' ? below : above;
  let left = rect.x + rect.width / 2 - card.w / 2;
  left = Math.max(MARGIN, Math.min(left, vp.w - card.w - MARGIN));
  return { side, left, top: Math.max(MARGIN, Math.min(top, vp.h - card.h - MARGIN)) };
}

/**
 * @param {{steps:Array, copy:object, onExit?:Function}} args
 *   step = { target:selector|null, copyKey, mascotState, before? }
 * @returns {{ next, prev, exit }}
 */
export function startCoachmark({ steps, copy, onExit }) {
  let i = 0;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const veil = document.createElement('div'); veil.className = 'cm-veil';
  const spot = document.createElement('div'); spot.className = 'cm-spotlight';
  const card = document.createElement('div'); card.className = 'cm-card';
  const veeSlot = document.createElement('div'); veeSlot.className = 'cm-vee';
  const vee = renderMascot(veeSlot);
  const text = document.createElement('p'); text.className = 'cm-text';
  const ctl = document.createElement('div'); ctl.className = 'cm-ctl';
  const back = document.createElement('button'); back.textContent = 'Back';
  const next = document.createElement('button'); next.textContent = 'Next';
  const skip = document.createElement('button'); skip.textContent = 'Skip'; skip.className = 'cm-skip';
  ctl.append(skip, back, next);
  card.append(veeSlot, text, ctl);
  veil.append(spot); document.body.append(veil, card);

  async function render() {
    const s = steps[i];
    if (s.before) { try { await s.before(); } catch { /* step action best-effort */ } }
    setMascotState(vee, s.mascotState || 'idle');
    text.textContent = copy[s.copyKey] || '';
    back.disabled = i === 0;
    next.textContent = i === steps.length - 1 ? 'Done' : 'Next';
    const el = s.target ? document.querySelector(s.target) : null;
    const vp = { w: innerWidth, h: innerHeight };
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      const r = el.getBoundingClientRect();
      spot.style.cssText = `display:block;left:${r.x - 6}px;top:${r.y - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`;
      const p = placeCard({ x: r.x, y: r.y, width: r.width, height: r.height }, { w: card.offsetWidth || 320, h: card.offsetHeight || 150 }, vp);
      card.style.left = p.left + 'px'; card.style.top = p.top + 'px';
    } else {
      spot.style.display = 'none';
      const p = placeCard(null, { w: card.offsetWidth || 320, h: card.offsetHeight || 150 }, vp);
      card.style.left = p.left + 'px'; card.style.top = p.top + 'px';
    }
  }
  function go(n) { i = Math.max(0, Math.min(steps.length - 1, n)); render(); }
  function step(d) { (i + d >= steps.length) ? exit() : go(i + d); }
  function exit() { veil.remove(); card.remove(); removeEventListener('keydown', onKey); onExit && onExit(); }
  const onKey = (e) => { if (e.key === 'Escape') exit(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); };
  back.onclick = () => step(-1); next.onclick = () => step(1); skip.onclick = exit;
  addEventListener('keydown', onKey);
  render();
  return { next: () => step(1), prev: () => step(-1), exit };
}
