import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider';
import './global.css';

// On GitHub Pages the static export is served under /<repo>/, so the static search
// index lives at <basePath>/api/search. Empty when served at root (local dev).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  metadataBase: new URL('https://new1direction.github.io/RepoLens/'),
  title: {
    default: 'RepoLens — read code before you trust it',
    template: '%s · RepoLens',
  },
  description:
    'A Chrome extension that turns any GitHub, GitLab, npm, or PyPI page into a plain-English, verdict-first briefing: what it is, whether it fits, and how it is actually built.',
  applicationName: 'RepoLens',
  openGraph: {
    title: 'RepoLens — read code before you trust it',
    description:
      'One click turns any repo into a verdict-first briefing — fit, health, and the real shape of the thing. Bring your own model. Nothing leaves your browser.',
    type: 'website',
    siteName: 'RepoLens',
  },
  twitter: { card: 'summary_large_image', title: 'RepoLens', description: 'Read code before you trust it.' },
};

/**
 * Applies the saved accent palette (data-palette) before first paint so the
 * named palettes don't flash. Light/dark is handled by next-themes' own script.
 */
const PALETTE_SCRIPT = `(function(){try{var p=localStorage.getItem('repolens-palette');if(p&&p!=='aurora')document.documentElement.setAttribute('data-palette',p);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PALETTE_SCRIPT }} />
      </head>
      <body>
        <RootProvider
          theme={{ defaultTheme: 'dark', enableSystem: true }}
          search={{ options: { type: 'static', api: `${basePath}/api/search` } }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
