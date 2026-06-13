import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import './global.css';

// On GitHub Pages the static export is served under /<repo>/, so the static search
// index lives at <basePath>/api/search. Empty when served at root (local dev).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata = {
  title: 'RepoLens — read code before you trust it',
  description:
    'A Chrome extension that turns any repo into a plain-English, verdict-first briefing: what it is, whether it fits, how it is built.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider search={{ options: { type: 'static', api: `${basePath}/api/search` } }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
