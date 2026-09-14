import { defineConfig } from 'vite';

export const STUDIO_PRODUCTION_CSP = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self'; connect-src 'self' https://auth.orchard.dastari.net wss://cellar.dastari.net; form-action 'self' https://auth.orchard.dastari.net";
// `frame-ancestors` is valid only in an HTTP response header. Keeping it in the
// fallback document policy makes Chromium emit a console error on every clean
// anonymous route even though the edge and preview headers enforce it.
export const STUDIO_DOCUMENT_CSP = STUDIO_PRODUCTION_CSP.replace(" frame-ancestors 'none';", '');

export function developmentCsp(html: string): string {
  return html
    .replace("worker-src 'self';", "worker-src 'self' blob:;")
    .replace("style-src 'self';", "style-src 'self' 'unsafe-inline';");
}

export const studioProxy = {
  '/v1': { target: 'http://127.0.0.1:3000', ws: true },
};

export const studioListenOptions = {
  port: 5174,
  strictPort: true,
  allowedHosts: ['cellar.dastari.net'],
};

export const studioSecurityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': STUDIO_PRODUCTION_CSP,
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export default defineConfig(({ command, isPreview }) => ({
  envDir: '../..',
  publicDir: 'public',
  plugins: command === 'serve' && !isPreview
    ? [{ name: 'orchard-studio-development-csp', transformIndexHtml: developmentCsp }]
    : [],
  server: {
    ...studioListenOptions,
    proxy: studioProxy,
  },
  preview: {
    ...studioListenOptions,
    proxy: studioProxy,
    headers: studioSecurityHeaders,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
