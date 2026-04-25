import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    passWithNoTests: false,
    reporters: ['default'],
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['apps/**/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.tsx'],
          setupFiles: ['apps/web/src/test/setup.ts'],
        },
      },
    ],
  },
});
