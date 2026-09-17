import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke suite (spec §8, CO-060). Runs against the Vite dev server so a
 * test can reach the running game through `import('/src/main.ts')` — the same
 * module instance `index.html` loads (see the note on `game` in `src/main.ts`).
 *
 * The port is one the project never uses for a dev server, so a suite run
 * never talks to a stale server from another checkout.
 */
const PORT = 5177;

export default defineConfig({
  testDir: 'e2e',
  // A smoke test waits 10 s of real time on top of boot; give it room.
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    // Same size as the Phaser canvas (`GAME_WIDTH` x `GAME_HEIGHT`), so with
    // `Scale.FIT` a page coordinate is a game coordinate and a test can click
    // a card where the scene draws it.
    viewport: { width: 960, height: 540 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
