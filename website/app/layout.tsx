import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import { RootProvider } from 'fumadocs-ui/provider';
import './global.css';

// On GitHub Pages the static export is served under /<repo>/, so the static search
// index lives at <basePath>/api/search. Empty when served at root (local dev).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Fraunces — a characterful display serif (self-hosted at build; works with
// output: export). Display headings only; body stays the system/Inter stack.
const display = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://new1direction.github.io/RepoLens/'),
  title: {
    default: 'RepoLens — read code before you trust it',
    template: '%s · RepoLens',
  },
  description:
    'A Chrome extension that investigates any GitHub, GitLab, npm, or PyPI repo and hands down a verdict — what it is, whether it fits, and how it is actually built. The case file on any dependency.',
  applicationName: 'RepoLens',
  openGraph: {
    title: 'RepoLens — read code before you trust it',
    description:
      'One click opens the case file on any repo: a verdict, the evidence, the red flags. Bring your own model. Nothing leaves your browser.',
    type: 'website',
    siteName: 'RepoLens',
  },
  twitter: { card: 'summary_large_image', title: 'RepoLens', description: 'Read code before you trust it.' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={display.variable} suppressHydrationWarning>
      <body>
        <RootProvider
          theme={{ defaultTheme: 'light', enableSystem: true }}
          search={{ options: { type: 'static', api: `${basePath}/api/search` } }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
