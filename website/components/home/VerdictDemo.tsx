'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A faithful, fully themeable recreation of the real scan output — now a LIVE
 * demo: the tabs are a real tablist (click + arrow-key) that crossfades the
 * card body, and the "Strong fit" verdict stamp slams in the first time the
 * card scrolls into view. Everything re-skins with the theme toggle instead of
 * being a screenshot that breaks in another palette. Motion is CSS-only and
 * gated behind `prefers-reduced-motion` in home.css.
 */

type Tab = { id: string; label: string; panel: ReactNode };

const HealthBars = () => {
  const rows: Array<[string, number]> = [
    ['Maintenance', 82],
    ['Activity', 71],
    ['Documentation', 95],
    ['Adoption', 99],
  ];
  return (
    <div className="vd-bars">
      {rows.map(([label, v]) => (
        <div className="vd-bar" key={label}>
          <span className="vd-bar-k">{label}</span>
          <span className="vd-bar-track">
            <span className="vd-bar-fill" style={{ width: `${v}%` }} />
          </span>
          <span className="vd-bar-v">{v}</span>
        </div>
      ))}
    </div>
  );
};

const TABS: Tab[] = [
  {
    id: 'verdict',
    label: 'Verdict',
    panel: (
      <>
        <div className="vd-verdict">
          <span className="vd-fit vd-stamp">Strong fit</span>
          <span className="vd-verdict-meta">Health 88 · 0 flags · 3 pros / 1 cons</span>
        </div>
        <div className="vd-bottom">
          <div className="vd-bottom-label">AI bottom line</div>
          <p>The default choice for Node HTTP services; boring in the best way.</p>
        </div>
        <div className="vd-lang">
          <span className="vd-lang-chip">JavaScript 99%</span>
          <span className="vd-lang-rest">TypeScript · Shell</span>
        </div>
      </>
    ),
  },
  {
    id: 'eli5',
    label: 'ELI5',
    panel: (
      <div className="vd-prose">
        <p>
          Express is the “hello world” of Node web servers. You hand it routes — “when someone
          visits <code>/users</code>, run this function” — and it handles the plumbing in between.
        </p>
        <p>
          Minimal on purpose: no database, no folder structure, no opinions. Just the
          request-in / response-out basics, and a way to stack little functions in the middle.
        </p>
      </div>
    ),
  },
  {
    id: 'technical',
    label: 'Technical',
    panel: (
      <ul className="vd-list">
        <li>
          <strong>Middleware pipeline</strong> — every request flows through a stack of
          <code> (req, res, next)</code> functions you compose yourself.
        </li>
        <li>
          <strong>Thin routing layer</strong> over Node’s native <code>http</code> module; ~16k LOC,
          no framework runtime underneath.
        </li>
        <li>
          <strong>Unbundled</strong> — no build step, composes directly with the npm ecosystem
          rather than replacing it.
        </li>
      </ul>
    ),
  },
  {
    id: 'usecases',
    label: 'Use Cases',
    panel: (
      <div className="vd-cases">
        <span className="vd-case">REST / JSON APIs</span>
        <span className="vd-case">Server-rendered apps</span>
        <span className="vd-case">Microservices</span>
        <span className="vd-case">A base other frameworks build on</span>
        <span className="vd-case">Quick prototypes</span>
      </div>
    ),
  },
  {
    id: 'health',
    label: 'Health',
    panel: <HealthBars />,
  },
  {
    id: 'redflags',
    label: 'Red Flags',
    panel: (
      <div className="vd-clean">
        <span className="vd-clean-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12.5l4.2 4.2L19 7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <div className="vd-clean-k">No red flags</div>
          <p>Permissive MIT license, active maintenance, no critical advisories in the manifest.</p>
        </div>
      </div>
    ),
  },
  {
    id: 'techstack',
    label: 'Tech Stack',
    panel: (
      <dl className="vd-stack">
        <div>
          <dt>Runtime</dt>
          <dd>Node.js</dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd>JavaScript · TypeScript types shipped separately</dd>
        </div>
        <div>
          <dt>Notable deps</dt>
          <dd>finalhandler · qs · send · serve-static</dd>
        </div>
      </dl>
    ),
  },
];

export function VerdictDemo() {
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Slam the stamp in the first time the card meets the viewport.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const selectTab = (next: number) => {
    const idx = (next + TABS.length) % TABS.length;
    setActive(idx);
    tabRefs.current[idx]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        selectTab(active + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        selectTab(active - 1);
        break;
      case 'Home':
        e.preventDefault();
        selectTab(0);
        break;
      case 'End':
        e.preventDefault();
        selectTab(TABS.length - 1);
        break;
      default:
        break;
    }
  };

  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setInteractive(fine && !reduce);
  }, []);

  // Holographic tilt — write CSS vars straight to the card so a pointer move
  // never triggers a React re-render. Desktop + non-reduced-motion only.
  const onHoloMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!interactive || !el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const MAX = 9;
    el.style.setProperty('--rx', `${(-(py - 0.5) * 2 * MAX).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((px - 0.5) * 2 * MAX).toFixed(2)}deg`);
    el.style.setProperty('--px', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--py', `${(py * 100).toFixed(1)}%`);
    el.style.setProperty('--active', '1');
  };

  const onHoloLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--px', '50%');
    el.style.setProperty('--py', '50%');
    el.style.setProperty('--active', '0');
  };

  const current = TABS[active];

  return (
    <section className="section verdict-demo reveal" aria-labelledby="verdict-heading">
      <div className="container vd-grid">
        <div className="vd-copy">
          <span className="eyebrow">The verdict</span>
          <h2 id="verdict-heading" className="section-title">
            It opens with the <span className="grad-text">verdict</span>, not the pitch.
          </h2>
          <p className="section-note">
            Stars tell you a project is popular. They don’t tell you whether it fits your problem.
            RepoLens leads with a fit call and a one-line bottom line — then lets you go as deep as
            you want.
          </p>
          <ul className="vd-points">
            <li>
              <strong>A fit call first</strong> — strong, solid, care, or risky — before a word of
              prose.
            </li>
            <li>
              <strong>Measured, not trusted</strong> — health, languages, flags, and tech stack
              pulled from the source.
            </li>
            <li>
              <strong>Deep on demand</strong> — ELI5, lineage, alternatives, and a Feynman-style
              explanation one click away.
            </li>
          </ul>
        </div>

        <div className="vd-card-stage">
          <div
            className={`vd-card${interactive ? ' is-holo' : ''}`}
            ref={cardRef}
            onPointerMove={onHoloMove}
            onPointerLeave={onHoloLeave}
          >
          <div className="vd-card-bar" aria-hidden="true">
            <span className="vd-dot" />
            <span className="vd-dot" />
            <span className="vd-dot" />
            <span className="vd-cache">Cached — no AI call</span>
          </div>

          <div className="vd-head">
            <div>
              <div className="vd-repo">expressjs/express</div>
              <div className="vd-desc">Fast, unopinionated, minimalist web framework for Node.js.</div>
              <div className="vd-chips">
                <span className="vd-chip">JavaScript</span>
                <span className="vd-chip">65k ★</span>
                <span className="vd-chip">MIT</span>
              </div>
            </div>
            <div className="vd-health">
              <div className="vd-health-n">88</div>
              <div className="vd-health-l">Repo health</div>
            </div>
          </div>

          <div className="vd-tabs" role="tablist" aria-label="Scan sections" onKeyDown={onKeyDown}>
            {TABS.map((t, idx) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`vd-tab-${t.id}`}
                aria-selected={idx === active}
                aria-controls={`vd-panel-${t.id}`}
                tabIndex={idx === active ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                className={`vd-tab${idx === active ? ' is-active' : ''}`}
                onClick={() => setActive(idx)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            key={current.id}
            className={`vd-panel${inView ? ' is-in' : ''}`}
            role="tabpanel"
            id={`vd-panel-${current.id}`}
            aria-labelledby={`vd-tab-${current.id}`}
            tabIndex={0}
          >
            {current.panel}
          </div>

            <div className="vd-foil" aria-hidden="true" />
            <div className="vd-glare" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}
