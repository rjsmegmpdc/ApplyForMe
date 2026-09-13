import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Default environment is 'node' (server logic). Component tests opt into
// jsdom per-file with a leading `// @vitest-environment jsdom` pragma.
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    name: 'web',
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', '.open-next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
