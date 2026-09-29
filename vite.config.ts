import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };
import { FEEDBACK_URL } from './src/core/feedback.ts';

/**
 * The built page's Content-Security-Policy (#316). GitHub Pages sends no
 * headers, so it rides in a meta tag, which the browser applies to everything
 * after it; `csp-meta` puts it first in `<head>`. `default-src 'none'` makes
 * every kind of load not listed here a violation. Each allowance is one the
 * game was seen to need under `e2e-csp/prod.spec.ts`:
 *
 * - `img-src data: blob:`: Phaser builds its default textures from data URLs
 *   and turns XHR-loaded atlas pages into object URLs.
 * - `connect-src`: the atlas and audio requests, and the one feedback endpoint.
 * - `font-src 'self'`: the menu title face (CO-191), a same-origin woff2 that
 *   Phaser's `load.font` adds through `FontFace`. It is a file, so no `data:`.
 * - `style-src 'self'`: `page.css`; Phaser and the Help form set styles through
 *   the CSSOM, which the policy does not govern.
 *
 * Not settable from a meta tag (accepted): `frame-ancestors`, `report-uri`, `sandbox`.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self'",
  `connect-src 'self' ${FEEDBACK_URL}`,
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Build only: the dev server's hot reload needs inline script and a websocket. */
const cspMeta: Plugin = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
};

export default defineConfig({
  plugins: [cspMeta],
  // Relative asset URLs so the same build works at the site root (local preview)
  // and under the repository sub-path on GitHub Pages.
  base: './',
  // The Help screen's About tab shows the build's version (#226); package.json
  // is the only place it is written.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Phaser alone is ~1.2 MB minified; the default 500 kB warning is noise here.
    chunkSizeWarningLimit: 1500,
  },
});
