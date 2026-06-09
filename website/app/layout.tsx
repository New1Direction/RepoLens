import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import './global.css';

export const metadata = {
  title: 'RepoLens — read code before you trust it',
  description:
    'A Chrome extension that turns any repo into a plain-English, verdict-first briefing: what it is, whether it fits, how it is built.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Search disabled for now — the advanced search index has a version-drift issue to revisit. */}
        <RootProvider search={{ enabled: false }}>{children}</RootProvider>
      </body>
    </html>
  );
}
