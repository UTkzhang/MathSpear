import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works on GitHub Pages (served under /<repo>/) and locally.
  base: './',
  build: {
    chunkSizeWarningLimit: 2000, // Phaser alone is ~1.2 MB minified
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
