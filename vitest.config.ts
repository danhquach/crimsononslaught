import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests cover pure logic (src/core/**) and typed config data
    // (src/config/**); Phaser code is exercised by the Playwright smoke suite
    // (CO-060), not here.
    // The art pipeline's cut helpers (CO-080) are plain JS under scripts/ so
    // `npm run art:cut` can run them with no build step; they are pure and get
    // the same unit coverage as src/core.
    include: ['src/core/**/*.test.ts', 'src/config/**/*.test.ts', 'scripts/lib/**/*.test.mjs'],
    environment: 'node',
  },
});
