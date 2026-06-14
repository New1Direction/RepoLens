import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/** Shared nav config consumed by both the home and docs layouts. */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
        🔭 RepoLens
      </span>
    ),
  },
  links: [
    {
      text: 'Docs',
      url: '/docs',
      active: 'nested-url',
    },
    {
      text: 'Changelog',
      url: '/changelog',
    },
  ],
  githubUrl: 'https://github.com/New1Direction/repolens',
};
