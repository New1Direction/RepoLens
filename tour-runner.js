// tour-runner.js
// Drive a canvas engine through tour steps. Overlay only — no relayout, no data mutation.

/**
 * @param {{host:HTMLElement, engine:{setSpotlight,clearSpotlight}, steps:object[], autoplay?:boolean}} args
 * @returns {{ next, prev, go, exit }}
 */
export function startTour({ host, engine, steps, autoplay = false }) {
  let i = 0;
  const card = document.createElement('div');
  card.className = 'rl-tour-card';
  host.appendChild(card);

  const reduced = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null;

  function render() {
    const s = steps[i];
    engine.setSpotlight(s.nodeIds);
    card.innerHTML = '';
    const step = document.createElement('div'); step.className = 'rl-tour-step';
    step.textContent = `Step ${s.order} of ${steps.length}`;
    const title = document.createElement('div'); title.className = 'rl-tour-title'; title.textContent = s.title;
    const blurb = document.createElement('p'); blurb.className = 'rl-tour-blurb'; blurb.textContent = s.blurb;
    const ctl = document.createElement('div'); ctl.className = 'rl-tour-ctl';
    const back = document.createElement('button'); back.textContent = '← Back'; back.disabled = i === 0; back.onclick = prev;
    const fwd = document.createElement('button'); fwd.textContent = i === steps.length - 1 ? 'Done' : 'Next →'; fwd.onclick = () => (i === steps.length - 1 ? exit() : next());
    ctl.append(back, fwd);
    card.append(step, title, blurb, ctl);
    if (s.lesson) { const l = document.createElement('div'); l.className = 'rl-tour-lesson'; l.textContent = s.lesson; card.insertBefore(l, ctl); }
    if (autoplay && !reduced) { clearTimeout(timer); timer = setTimeout(() => (i < steps.length - 1 ? next() : exit()), 6000); }
  }
  function go(n) { i = Math.max(0, Math.min(steps.length - 1, n)); render(); }
  function next() { go(i + 1); }
  function prev() { go(i - 1); }
  function exit() { clearTimeout(timer); engine.clearSpotlight(); card.remove(); host.removeEventListener('keydown', onKey); }

  const onKey = (ev) => { if (ev.key === 'ArrowRight') next(); else if (ev.key === 'ArrowLeft') prev(); else if (ev.key === 'Escape') exit(); };
  host.addEventListener('keydown', onKey);

  render();
  return { next, prev, go, exit };
}
