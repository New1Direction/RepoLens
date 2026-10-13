// Share-card page: decodes the verdict card from the URL hash and renders it.
// Lives in its own file because MV3 extension pages block inline scripts.
import { decodeShareCard } from './share-card.js';

const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const fmtStars = (n) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

const card = document.getElementById('card');
const data = decodeShareCard(location.hash);

if (!data) {
  card.innerHTML = `<div class="error">
<h2>Invalid share link</h2>
<p>This verdict card link is missing or corrupted.</p>
    </div>`;
} else {
  const fitLabel =
    { strong: 'Strong fit', solid: 'Solid', care: 'Use with care', risky: 'Risky' }[data.fitLevel] || 'Solid';
  const pills = [
    data.language ? `<span class="pill">${esc(data.language)}</span>` : '',
    data.stars ? `<span class="pill">${esc(fmtStars(data.stars))} ★</span>` : '',
    data.license ? `<span class="pill">${esc(data.license)}</span>` : '',
    data.health ? `<span class="pill health-pill">Health ${data.health}</span>` : '',
  ]
    .filter(Boolean)
    .join('');

  card.innerHTML = `
<div class="brand">
  <div class="brand-icon">🔍</div>
  <span class="brand-name">REPOLENS VERDICT</span>
</div>
<div class="repo-id">${esc(data.repoId)}</div>
${data.description ? `<p class="description">${esc(data.description)}</p>` : ''}
<span class="fit-chip fit-${esc(data.fitLevel)}">${esc(fitLabel)}</span>
${data.eli5 ? `<p class="eli5">${esc(data.eli5)}</p>` : ''}
${pills ? `<div class="pills">${pills}</div>` : ''}
<div class="footer">
  <span class="footer-label">Shared via RepoLens</span>
</div>
    `;
  document.title = `RepoLens — ${data.repoId}`;
}
