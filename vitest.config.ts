import { defineConfig } from 'vitest/config';

export default defineConfig({
  mode: 'node',
  test: {
    deps: {
      interopDefault: true,
    },
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'frontend/**', 'contracts/managed'],
    root: '.',
    testTimeout: 120000,
    hookTimeout: 120000,
  },
  resolve: {
    extensions: ['.ts', '.js'],
    conditions: ['import', 'node', 'default'],
  },
});
