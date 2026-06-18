// mascot.js — "Vee", the RepoLens lens mascot. Dependency-free, DOM-only.
//
// Vee is purely decorative: every instance is aria-hidden, and meaning is always
// carried by the real UI (the verdict chip text/colour, the loading/error copy).
// One SVG; each expression is a CSS class swap (see mascot.css). The host page
// owns the on/off gate (a Settings toggle) — this module never reads storage, so
// it works identically in the extension and in mascot-preview.html.

export const VEE_STATES = Object.freeze([
  'idle',
  'scanning',
  'strong',
  'risky',
  'thinking',
  'empty',
  'error',
]);

// Verdict fit value → Vee state. Only the two extremes earn a distinct face;
// 'solid'/'care' rest at idle (deliberate restraint — a mascot that reacts to
// everything reacts to nothing).
const FIT_TO_STATE = Object.freeze({ strong: 'strong', risky: 'risky' });

// The markup, in one place so every slot is identical and token-aware.
const VEE_SVG = `
  <svg viewBox="0 0 48 48" width="40" height="40" fill="none" role="presentation" xmlns="http://www.w3.org/2000/svg">
    <circle class="vee-barrel" cx="24" cy="24" r="17" stroke="currentColor" stroke-width="2" opacity="0.32"/>
    <g class="vee-ticks" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.28">
      <line x1="24" y1="3.5" x2="24" y2="7.5"/><line x1="24" y1="40.5" x2="24" y2="44.5"/>
      <line x1="3.5" y1="24" x2="7.5" y2="24"/><line x1="40.5" y1="24" x2="44.5" y2="24"/>
    </g>
    <circle class="vee-aperture" cx="24" cy="24" r="9" stroke="var(--accent)" stroke-width="3"/>
    <circle class="vee-pupil" cx="24" cy="24" r="2.4" fill="var(--accent)"/>
  </svg>`;

/** The raw Vee SVG string (for static, code-owned slots like the Library empty state). */
export function veeSvg() {
  return VEE_SVG;
}

/**
 * Set Vee's expression — a pure class swap on the same element.
 * @param {Element|null} el the .vee wrapper
 * @param {string} state one of VEE_STATES; unknown values fall back to 'idle'
 */
export function setMascotState(el, state) {
  if (!el) return;
  const next = VEE_STATES.includes(state) ? state : 'idle';
  for (const s of VEE_STATES) el.classList.toggle(`is-${s}`, s === next && s !== 'idle');
}

/**
 * Drive Vee straight from a verdict fit value ('strong'|'solid'|'care'|'risky').
 * @param {Element|null} el the .vee wrapper
 * @param {string} fit the fit level
 */
export function setMascotFromFit(el, fit) {
  setMascotState(el, FIT_TO_STATE[fit] || 'idle');
}

/**
 * Replace a slot's contents with a Vee in the given state, and return the wrapper.
 * The caller is responsible for honouring the user's mascot setting before calling.
 * @param {Element|null} slot the element whose contents become Vee
 * @param {string} [initial] starting state
 * @returns {HTMLElement|null} the .vee wrapper, or null if no slot
 */
export function renderMascot(slot, initial = 'idle') {
  if (!slot) return null;
  const wrap = document.createElement('span');
  wrap.className = 'vee';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = VEE_SVG;
  slot.replaceChildren(wrap);
  setMascotState(wrap, initial);
  return wrap;
}
