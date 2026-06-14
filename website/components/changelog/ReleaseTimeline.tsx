import { RELEASES } from '@/lib/releases';

export function ReleaseTimeline() {
  return (
    <div className="timeline">
      {RELEASES.map((r) => (
        <article className="rel" key={r.version}>
          <div className="rel-head">
            <span className="rel-v">v{r.version}</span>
            <span className="rel-theme">{r.theme}</span>
            <span className="rel-date">{r.date}</span>
          </div>
          <p className="rel-body">{r.summary}</p>
          {r.highlights ? (
            <ul className="rel-list">
              {r.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </div>
  );
}
