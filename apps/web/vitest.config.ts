import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Disable PostCSS so vitest doesn't try to parse the Tailwind v4 config.
  css: { postcss: { plugins: [] } },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
