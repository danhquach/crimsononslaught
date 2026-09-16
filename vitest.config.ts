import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests cover pure logic (src/core/**) and typed config data
    // (src/config/**); Phaser code is exercised by the Playwright smoke suite
    // (CO-060), not here.
    include: ['src/core/**/*.test.ts', 'src/config/**/*.test.ts'],
    environment: 'node',
  },
});
