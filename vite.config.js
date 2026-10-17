import { defineConfig } from 'vite';

// GitHub Pages serves the site at https://<username>.github.io/<repo-name>/.
// The deploy workflow sets BASE_PATH to "/<repo-name>/". Locally we fall back to
// a relative base, which also works on Pages because this is a single page.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true,
  },
});
