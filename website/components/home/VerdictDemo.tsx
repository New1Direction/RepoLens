const TABS = ['Verdict', 'ELI5', 'Technical', 'Use Cases', 'Health', 'Red Flags', 'Tech Stack'];

/**
 * A faithful, fully themeable recreation of the real scan output — so it
 * re-skins with the toggle instead of being a screenshot that breaks in latte.
 */
export function VerdictDemo() {
  return (
    <section className="section verdict-demo reveal" aria-labelledby="verdict-heading">
      <div className="container vd-grid">
        <div className="vd-copy">
          <span className="eyebrow">The output</span>
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

        <div className="vd-card" role="img" aria-label="A RepoLens verdict for expressjs/express: strong fit, health 88.">
          <div className="vd-card-bar" aria-hidden="true">
            <span className="vd-dot" />
            <span className="vd-dot" />
            <span className="vd-dot" />
            <span className="vd-cache">⚡ Loaded from cache — no AI call</span>
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

          <div className="vd-tabs" aria-hidden="true">
            {TABS.map((t, idx) => (
              <span key={t} className={`vd-tab${idx === 0 ? ' is-active' : ''}`}>
                {t}
              </span>
            ))}
          </div>

          <div className="vd-verdict">
            <span className="vd-fit">Strong fit</span>
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
        </div>
      </div>
    </section>
  );
}
