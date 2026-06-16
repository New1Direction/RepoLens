import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The repo ships no DOM dependency (jsdom/happy-dom) and `npm install` is
// off-limits, so the one DOM-bound test (canvas-engine) runs against an in-repo
// minimal DOM. Vitest's `@vitest-environment` pragma only accepts a bare
// `[\w-]+` token, which it resolves as `vitest-environment-<name>`; this alias
// points that lookup at our local environment module.
const domEnvironment = fileURLToPath(new URL('./tests/dom-environment.js', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'vitest-environment-repolensdom': domEnvironment,
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Cover the pure source modules; DOM/service-worker entry points and the
      // website are out of scope for unit coverage.
      include: ['*.js', 'store/**/*.js', 'migrate/**/*.js'],
      exclude: [
        'tests/**',
        'website/**',
        '*.config.js',
        'background.js',
        'content_script.js',
        'output-tab.js',
        'options.js',
        'library.js',
      ],
    },
  },
});
