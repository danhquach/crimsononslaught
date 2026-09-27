import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
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
