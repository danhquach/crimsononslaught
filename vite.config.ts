import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Phaser alone is ~1.2 MB minified; the default 500 kB warning is noise here.
    chunkSizeWarningLimit: 1500,
  },
});
