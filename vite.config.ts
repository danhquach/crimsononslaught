import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the same build works at the site root (local preview)
  // and under the repository sub-path on GitHub Pages.
  base: './',
  build: {
    // Phaser alone is ~1.2 MB minified; the default 500 kB warning is noise here.
    chunkSizeWarningLimit: 1500,
  },
});
