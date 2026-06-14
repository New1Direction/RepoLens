import Link from 'next/link';
import { HeroMascot } from './HeroMascot';
import { GITHUB_URL } from '@/components/site/SiteHeader';

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="kicker">
            <span className="pulse" /> Chrome Extension · Manifest V3 · v3.0
          </span>

          <h1 id="hero-heading" className="hero-title">
            Read code before
            <br />
            you <span className="grad-text">trust it.</span>
          </h1>

          <p className="hero-sub">
            One click turns any GitHub, GitLab, npm, or PyPI page into a plain-English,
            verdict-first briefing — what it is, whether it fits, and how it’s actually built.
            Not the README’s pitch. The real shape of the thing.
          </p>

          <div className="hero-cta">
            <Link href="/docs/getting-started" className="btn btn-primary">
              Install RepoLens
            </Link>
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
          <HeroMascot />
        </div>
      </div>
    </section>
  );
}
