import { GITHUB_URL } from '@/lib/distribution';
import { InstallButton } from '@/components/site/InstallButton';

export function FinalCta() {
  return (
    <section className="section final-cta reveal" aria-labelledby="cta-heading">
      <div className="container final-cta-inner">
        <span className="final-cta-kicker">Local/private by default</span>
        <h2 id="cta-heading" className="final-cta-title">
          Stop trusting the README.
        </h2>
        <p className="final-cta-sub">
          Install RepoLens, point it at the next dependency you’re weighing, and read the real shape
          of the thing — in plain English, in seconds.
        </p>
        <div className="hero-cta">
          <InstallButton />
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            Star on GitHub →
          </a>
        </div>
      </div>
    </section>
  );
}
