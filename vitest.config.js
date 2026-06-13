import { defineConfig } from 'vitest/config';

export default defineConfig({
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
