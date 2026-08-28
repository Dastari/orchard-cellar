import { defineConfig } from 'vite';
import clientPackage from './package.json' with { type: 'json' };
import { createPwaServiceWorker } from './pwa-service-worker.js';

export function developmentCsp(html: string): string {
  return html.replace("style-src 'self';", "style-src 'self' 'unsafe-inline';");
}

export default defineConfig(({ command }) => {
  const pwaBuildId = `${clientPackage.version}-${Date.now().toString(36)}`;
  return ({
  envDir: '../..',
  define: {
    'import.meta.env.VITE_CLIENT_VERSION': JSON.stringify(clientPackage.version),
    'import.meta.env.VITE_PWA_BUILD_ID': JSON.stringify(pwaBuildId),
  },
  // The browser SDK is already distributed as ESM. Serving it directly also
  // avoids invalidating the running game when Vite rotates its optimized-dep
  // generation after bindings or workspace packages change.
  optimizeDeps: {
    exclude: ['spacetimedb'],
    include: ['base64-js', 'safe-stable-stringify'],
  },
  plugins: [
    ...(command === 'serve' ? [{
      name: 'orchard-development-csp',
      transformIndexHtml: developmentCsp,
    }] : []),
    ...(command === 'build' ? [{
      name: 'orchard-pwa-service-worker',
      generateBundle(this: { emitFile: (asset: { type: 'asset'; fileName: string; source: string }) => void }) {
        this.emitFile({ type: 'asset', fileName: 'service-worker.js', source: createPwaServiceWorker(pwaBuildId) });
      },
    }] : []),
  ],
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
    rollupOptions: { input: ['index.html', 'editor.html', 'audio-preview.html'] },
  },
  });
});
