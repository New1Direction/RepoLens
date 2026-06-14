import type { Metadata } from 'next';
import { Vee } from '@/components/site/Vee';
import { ReleaseTimeline } from '@/components/changelog/ReleaseTimeline';
import { LATEST } from '@/lib/releases';
import '../styles/changelog.css';

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'Every RepoLens release, newest first — from the first verdict to a library that finds its own peers.',
};

const STATS = [
  { n: '30+', l: 'Releases' },
  { n: '13', l: 'Themes' },
  { n: '20+', l: 'AI providers' },
  { n: '100%', l: 'Client-side' },
];

export default function ChangelogPage() {
  return (
    <section className="section changelog">
      <div className="container">
        <header className="cl-header">
          <span className="eyebrow">Changelog</span>
          <h1 className="section-title">Everything, newest first.</h1>
          <p className="section-note">
            RepoLens ships in tight, themed releases. Here’s the whole arc — from the first
            verdict-first scan to discovery, evaluation, and an N-way decision matrix.
          </p>
          <div className="cl-stats">
            {STATS.map((s) => (
              <div className="cl-stat" key={s.l}>
                <div className="cl-stat-n grad-text">{s.n}</div>
                <div className="cl-stat-l">{s.l}</div>
              </div>
            ))}
          </div>
        </header>

        <article className="latest-card">
          <div className="latest-top">
            <span className="vtag">v{LATEST.version}</span>
            <span className="vbadge">● Newest</span>
            <span className="vtheme">{LATEST.theme}.</span>
            <span className="vdate">{LATEST.date}</span>
            <span className="latest-vee">
              <Vee state="strong" size={30} label="Latest release" />
            </span>
          </div>
          <p className="latest-summary">{LATEST.summary}</p>
          {LATEST.highlights ? (
            <ul className="latest-highlights">
              {LATEST.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          ) : null}
        </article>

        <h2 className="cl-subhead">The rest of the arc</h2>
        <ReleaseTimeline />
      </div>
    </section>
  );
}
