import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int-spec.ts'],
          setupFiles: ['test/setup-env.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
