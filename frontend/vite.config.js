import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true, // អនុញ្ញាត tunnel domains
    proxy: {
      '/api': 'http://localhost:3000',
      '/webhook': 'http://localhost:3000',
    },
  },
});