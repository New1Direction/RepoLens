import Link from 'next/link';
import { Vee } from './Vee';
import { GITHUB_URL } from './SiteHeader';

const PILLS = ['No backend', 'No accounts', 'Your keys, your machine', 'Manifest V3'];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link href="/" className="brand" aria-label="RepoLens home">
            <Vee state="resting" size={24} />
            <span className="brand-name">RepoLens</span>
          </Link>
          <p>Read code before you trust it. Built for people who scan with intent.</p>
          <div className="footer-pills">
            {PILLS.map((p) => (
              <span className="pill" key={p}>
                {p}
              </span>
            ))}
          </div>
        </div>

        <nav className="site-footer-nav" aria-label="Footer">
          <div className="footer-col">
            <h3>Product</h3>
            <Link href="/docs/getting-started">Install</Link>
            <Link href="/docs/the-scan">The scan</Link>
            <Link href="/docs/models">Models</Link>
            <Link href="/changelog">Changelog</Link>
          </div>
          <div className="footer-col">
            <h3>Docs</h3>
            <Link href="/docs">Introduction</Link>
            <Link href="/docs/how-it-works">How it works</Link>
            <Link href="/docs/storage">Storage</Link>
            <Link href="/docs/runner">The runner</Link>
          </div>
          <div className="footer-col">
            <h3>Project</h3>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noopener noreferrer">
              Releases
            </a>
            <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
              License
            </a>
          </div>
        </nav>
      </div>

      <div className="site-footer-base">
        <span>
          <span aria-hidden="true">🔭</span> RepoLens — v3.0 · client-side only
        </span>
        <span>Bring your own model. Nothing leaves your browser.</span>
      </div>
    </footer>
  );
}
