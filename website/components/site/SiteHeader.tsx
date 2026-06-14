import Link from 'next/link';
import { Vee } from './Vee';
import { ThemeToggle } from './ThemeToggle';

export const GITHUB_URL = 'https://github.com/New1Direction/RepoLens';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="RepoLens home">
          <Vee state="resting" size={26} />
          <span className="brand-name">RepoLens</span>
        </Link>

        <nav className="site-nav" aria-label="Primary">
          <Link href="/docs">Docs</Link>
          <Link href="/changelog">Changelog</Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </nav>

        <div className="site-header-actions">
          <ThemeToggle />
          <Link href="/docs/getting-started" className="btn btn-primary btn-sm">
            Install
          </Link>
        </div>
      </div>
    </header>
  );
}
