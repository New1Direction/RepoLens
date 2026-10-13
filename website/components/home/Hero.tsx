import { GITHUB_URL } from '@/lib/distribution';
import { InstallButton } from '@/components/site/InstallButton';

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="kicker">
            <span className="pulse" /> Chrome extension for evaluating open-source dependencies
          </span>

          <h1 id="hero-heading" className="hero-title">
            Read code before
            <br />
            you <span className="hero-mark">trust it.</span>
          </h1>

          <p className="hero-sub">
            One click turns any GitHub, GitLab, npm, or PyPI page into a plain-English,
            verdict-first briefing — what it is, whether it fits, and how it’s actually built.
            Not the README’s pitch. The real shape of the thing.
          </p>

          <div className="hero-cta">
            <InstallButton />
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              View on GitHub →
            </a>
          </div>

          <p className="hero-foot">
            Bring your own model · 20+ providers · no server, no account, nothing leaves your
            browser
          </p>
        </div>

        <div className="hero-aside">
          <div className="hero-proof" aria-label="RepoLens scan result preview">
            <div className="hero-proof-bar">
              <span className="proof-dot" />
              <span className="proof-dot" />
              <span className="proof-dot" />
              <span className="proof-url">github.com/org/repo</span>
            </div>
            <div className="hero-proof-body">
              <div className="proof-status">
                <span className="proof-badge">Solid fit</span>
                <span className="proof-score">84</span>
              </div>
              <h2>Verdict before the README pitch.</h2>
              <p>
                Maintained, testable, permissive license. Watch dependency churn before adopting.
              </p>
              <div className="proof-meter" aria-hidden="true">
                <span style={{ width: '84%' }} />
              </div>
              <ul className="proof-list">
                <li>License: MIT</li>
                <li>Tests: present</li>
                <li>Risk: dependency drift</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
