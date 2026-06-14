import Link from 'next/link';
import { Vee } from '@/components/site/Vee';
import { GITHUB_URL } from '@/components/site/SiteHeader';

export function FinalCta() {
  return (
    <section className="section final-cta reveal" aria-labelledby="cta-heading">
      <div className="container final-cta-inner">
        <Vee state="strong" size={56} label="Vee, ready" />
        <h2 id="cta-heading" className="final-cta-title">
          Stop trusting the README.
        </h2>
        <p className="final-cta-sub">
          Install RepoLens, point it at the next dependency you’re weighing, and read the real shape
          of the thing — in plain English, in seconds.
        </p>
        <div className="hero-cta">
          <Link href="/docs/getting-started" className="btn btn-primary">
            Install RepoLens
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            Star on GitHub →
          </a>
        </div>
      </div>
    </section>
  );
}
