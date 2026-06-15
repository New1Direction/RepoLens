import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Icon } from '@/components/site/Icon';

/** Shared nav config consumed by the docs layout. */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          fontWeight: 700,
          letterSpacing: '-0.02em',
        }}
      >
        <Icon name="lens" size={18} />
        RepoLens
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
  githubUrl: 'https://github.com/New1Direction/RepoLens',
};
