import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../url-detector.js';

describe('detectPlatform', () => {
  it('detects a GitHub repo', () => {
    expect(detectPlatform('https://github.com/facebook/react')).toEqual({
      platform: 'github',
      repoId: 'facebook/react',
    });
  });
  it('detects a GitHub repo with trailing path', () => {
    expect(detectPlatform('https://github.com/facebook/react/issues/123')).toEqual({
      platform: 'github',
      repoId: 'facebook/react',
    });
  });
  it('detects a GitLab repo', () => {
    expect(detectPlatform('https://gitlab.com/inkscape/inkscape')).toEqual({
      platform: 'gitlab',
      repoId: 'inkscape/inkscape',
    });
  });
  it('detects an npm package', () => {
    expect(detectPlatform('https://www.npmjs.com/package/lodash')).toEqual({
      platform: 'npm',
      repoId: 'lodash',
    });
  });
  it('detects a scoped npm package', () => {
    expect(detectPlatform('https://www.npmjs.com/package/@anthropic-ai/sdk')).toEqual({
      platform: 'npm',
      repoId: '@anthropic-ai/sdk',
    });
  });
  it('detects a PyPI package', () => {
    expect(detectPlatform('https://pypi.org/project/requests')).toEqual({
      platform: 'pypi',
      repoId: 'requests',
    });
  });
  it('returns null for unsupported URLs', () => {
    expect(detectPlatform('https://google.com')).toBeNull();
    expect(detectPlatform('https://github.com/facebook')).toBeNull();
  });
});
