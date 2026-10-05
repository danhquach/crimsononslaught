import { defineConfig, devices } from '@playwright/test';
import { E2E_FEEDBACK_KEY } from './playwright.config';

/**
 * The built page under its Content-Security-Policy meta tag (#316). The main
 * suite runs on the dev server, which has no meta (hot reload needs inline
 * script), so this one builds the site and serves the build with `vite
 * preview`. It builds into `dist-csp/`, never `dist/`: the deploy uploads
 * `dist/`, and this build carries the stand-in feedback key.
 *
 * Its own port, so a run never talks to a stale server from the main suite.
 */
export const PORT = 5178;
const VIEWPORT = { width: 960, height: 540 };

export default defineConfig({
  testDir: 'e2e-csp',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The main suite's HTML report owns `playwright-report/`; this one would overwrite it.
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // Same viewport size as the Phaser canvas, so a page coordinate is a game coordinate.
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: VIEWPORT } },
    // The itch.io embed runs in readers' browsers (#422): `npm run test:itch` adds the
    // other two engines, for the iframe spec only. Off by default so `test:csp` and CI
    // need no extra browser installs.
    ...(process.env.CSP_ALL_BROWSERS
      ? [
          {
            name: 'firefox',
            testMatch: /itch-iframe/,
            use: { ...devices['Desktop Firefox'], viewport: VIEWPORT },
          },
          {
            name: 'webkit',
            testMatch: /itch-iframe/,
            use: { ...devices['Desktop Safari'], viewport: VIEWPORT, deviceScaleFactor: 1 },
          },
        ]
      : []),
  ],
  webServer: {
    command: `npx vite build --outDir dist-csp --emptyOutDir && npx vite preview --outDir dist-csp --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_FEEDBACK_ACCESS_KEY: E2E_FEEDBACK_KEY },
  },
});
