// Stack Builder output tab — polls chrome.storage.session for the build result.
import { initTheme } from './theme.js';
import { STACK_LAYERS } from './stack-prompt.js';

initTheme();

const params = new URLSearchParams(location.search);
const sessionKey = params.get('key');
const main = document.getElementById('main');

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(data) {
  if (!data) {
    main.innerHTML = `<div class="st-loading"><span class="st-dot"></span>Waiting for data…</div>`;
    return;
  }

  if (data.loading) {
    const phrase = data.status === 'thinking' ? 'Designing your stack…' : 'Loading repo data…';
    main.innerHTML = `<div class="st-loading"><span class="st-dot"></span>${phrase}</div>`;
    return;
  }

  if (data.error) {
    main.innerHTML = `<div class="st-error"><h2>Build failed</h2><p>${esc(data.error)}</p></div>`;
    return;
  }

  const r = data.result;
  if (!r) {
    main.innerHTML = `<div class="st-error"><h2>No result</h2><p>The stack build returned no data.</p></div>`;
    return;
  }

  document.title = `RepoLens — ${r.title || 'Stack Builder'}`;

  const rolesHtml = (r.roles || []).map(role => {
    const layer = STACK_LAYERS.includes(role.layer) ? role.layer : 'tooling';
    return `<div class="role-card">
      <span class="role-layer ${layer}">${layer}</span>
      <div>
        <div class="role-name">${esc(role.repoId)}</div>
        <div class="role-desc">${esc(role.role)}</div>
      </div>
    </div>`;
  }).join('');

  const integHtml = (r.integrations || []).map(i => `
    <div class="integ-row">
      <span class="integ-from">${esc(i.from.split('/').pop() || i.from)}</span>
      <span class="integ-arrow">→</span>
      <span class="integ-to">${esc(i.to.split('/').pop() || i.to)}</span>
      <span class="integ-glue">${esc(i.glue)}</span>
    </div>`).join('');

  const gapsHtml = (r.gaps || []).map(g => `<div class="gap-item">${esc(g)}</div>`).join('');

  const orderHtml = (() => {
    const steps = r.order || [];
    return steps.map((id, i) => {
      const name = String(id).split('/').pop() || id;
      return `<span class="order-step"><span class="order-num">${i + 1}</span>${esc(name)}</span>${i < steps.length - 1 ? '<span class="order-arrow">→</span>' : ''}`;
    }).join('');
  })();

  main.innerHTML = `
    <h1 class="stack-title">${esc(r.title)}</h1>
    ${r.summary ? `<p class="stack-summary">${esc(r.summary)}</p>` : ''}
    ${rolesHtml ? `<div class="section-label">Roles</div><div class="roles-grid">${rolesHtml}</div>` : ''}
    ${integHtml ? `<div class="section-label">Integrations</div><div class="integrations">${integHtml}</div>` : ''}
    ${gapsHtml ? `<div class="section-label">Gaps to fill</div><div class="gaps">${gapsHtml}</div>` : ''}
    ${orderHtml ? `<div class="section-label">Adoption order</div><div class="order">${orderHtml}</div>` : ''}
  `;
}

async function poll() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const stored = await chrome.storage.session.get(sessionKey);
    const data = stored[sessionKey];
    render(data);
    if (data && !data.loading) return;
    await new Promise(r => setTimeout(r, 400));
  }
  main.innerHTML = `<div class="st-error"><h2>Timed out</h2><p>The stack build took too long. Please try again.</p></div>`;
}

if (sessionKey) {
  poll();
} else {
  main.innerHTML = `<div class="st-error"><h2>Missing session</h2><p>This page requires a session key to render.</p></div>`;
}
