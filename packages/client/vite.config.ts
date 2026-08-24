import { defineConfig } from 'vite';

export default defineConfig({
  envDir: '../..',
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['development.tail7a58a6.ts.net', 'orchard.dastari.net'],
    proxy: {
      '/v1': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: ['account.html', 'audio-preview.html', 'overworld.html'] },
  },
});
