import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests cover pure logic only (src/core/**); Phaser code is exercised by
    // the Playwright smoke suite (CO-060), not here.
    include: ['src/core/**/*.test.ts'],
    environment: 'node',
  },
});
