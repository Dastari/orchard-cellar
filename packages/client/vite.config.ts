import { defineConfig } from 'vite';

export function developmentCsp(html: string): string {
  return html.replace("style-src 'self';", "style-src 'self' 'unsafe-inline';");
}

export default defineConfig(({ command }) => ({
  envDir: '../..',
  plugins: command === 'serve' ? [{
    name: 'orchard-development-csp',
    transformIndexHtml: developmentCsp,
  }] : [],
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['development.tail7a58a6.ts.net', 'orchard.tail7a58a6.ts.net', 'orchard.dastari.net'],
    proxy: {
      '/v1': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: ['index.html', 'audio-preview.html'] },
  },
}));
