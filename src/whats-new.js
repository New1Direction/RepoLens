// What's New page: Vee state demo + scroll reveals.
// Lives in its own file because MV3 extension pages block inline scripts.
const SAYS = {
  scanning: 'Reading the source. This is the boring, important part.',
  strong: "Looked hard. Couldn't find the catch. Rare.",
  risky: 'Eyes narrowed. The README and the code disagree.',
  thinking: 'Tracing how the pieces actually fit together…',
  empty: 'Nothing to look at yet. Point me at a repo.',
};

const VEE_SVG = `
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" role="presentation" xmlns="http://www.w3.org/2000/svg">
<circle class="vee-barrel" cx="24" cy="24" r="17" stroke="currentColor" stroke-width="2" opacity="0.32"/>
<g class="vee-ticks" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.28">
  <line x1="24" y1="3.5" x2="24" y2="7.5"/><line x1="24" y1="40.5" x2="24" y2="44.5"/>
  <line x1="3.5" y1="24" x2="7.5" y2="24"/><line x1="40.5" y1="24" x2="44.5" y2="24"/>
</g>
<circle class="vee-aperture" cx="24" cy="24" r="9" stroke="var(--accent)" stroke-width="3"/>
<circle class="vee-pupil" cx="24" cy="24" r="2.4" fill="var(--accent)"/>
    </svg>`;
document.querySelectorAll('.vee').forEach((el) => {
  el.innerHTML = VEE_SVG;
});

const STATES = ['scanning', 'strong', 'risky', 'thinking', 'empty'];
const setState = (el, s) => {
  STATES.forEach((x) => el.classList.toggle('is-' + x, x === s));
};

const demoVee = document.getElementById('demoVee');
const veeSay = document.getElementById('veeSay');
document.getElementById('veeBtns').addEventListener('click', (e) => {
  const btn = e.target.closest('.vbtn');
  if (!btn) return;
  const s = btn.dataset.state;
  document.querySelectorAll('#veeBtns .vbtn').forEach((b) => b.classList.toggle('on', b === btn));
  setState(demoVee, s);
  veeSay.textContent = SAYS[s] || '';
});

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const items = document.querySelectorAll('.reveal');
if (reduce || !('IntersectionObserver' in window)) {
  items.forEach((el) => el.classList.add('in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  items.forEach((el) => io.observe(el));
}
