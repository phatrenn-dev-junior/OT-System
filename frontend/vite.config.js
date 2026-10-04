import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite normally expects index.html at the project root. This plugin lets the
 * entry file live at public/index.html (as in the required folder structure):
 *  - dev:   serves /public/index.html for "/" so it still gets transformed (HMR, React refresh)
 *  - build: bundles it and emits it as dist/index.html
 */
function htmlFromPublicFolder() {
  return {
    name: 'html-from-public-folder',
    enforce: 'post',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path === '/' || path === '/index.html') req.url = '/public/index.html';
        next();
      });
    },
    generateBundle(_options, bundle) {
      const key = 'public/index.html';
      if (bundle[key]) {
        const file = bundle[key];
        file.fileName = 'index.html';
        bundle['index.html'] = file;
        delete bundle[key];
      }
    },
  };
}

export default defineConfig({
  publicDir: false, // public/ only holds the HTML entry here
  plugins: [react(), tailwindcss(), htmlFromPublicFolder()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true, // allow tunnel domains (ngrok, cloudflared, ...)
  },
  build: {
    rollupOptions: {
      input: 'public/index.html',
    },
  },
});