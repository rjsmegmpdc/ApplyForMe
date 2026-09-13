import { defineConfig } from 'vitest/config';

// Each workspace package carries its own vitest.config.ts; `npm test` at the
// root runs every project.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
