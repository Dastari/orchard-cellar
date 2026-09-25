import { defineConfig, loadEnv, type Plugin } from 'vite';
import { chunkRuntimeBuildAudit } from './src/chunk-shadow-build-gate.js';
import clientPackage from './package.json' with { type: 'json' };
import { createPwaServiceWorker } from './pwa-service-worker.js';
import { worldChunkServing } from './world-chunk-serving.js';

export function developmentCsp(html: string): string {
  const withViteStyles = html.replace(
    "style-src 'self';",
    "style-src 'self' 'unsafe-inline';",
  );
  const withViteWorker = withViteStyles.includes("worker-src 'self';")
    ? withViteStyles.replace("worker-src 'self';", "worker-src 'self' blob:;")
    : withViteStyles.replace("script-src ", "worker-src 'self' blob:; script-src ");
  return withViteWorker;
}

export const clientProxy = {
  '/v1': { target: 'http://127.0.0.1:3000', ws: true },
};

export const clientListenOptions = {
  port: 5173,
  strictPort: true,
  allowedHosts: ['development.tail7a58a6.ts.net', 'orchard.tail7a58a6.ts.net', 'orchard.dastari.net'],
};

/** Check emitted chunks, including dynamic imports, so shared barrel changes
 * cannot silently ship the Studio workbench in the independent game build. */
export function clientStudioBoundary(): Plugin {
  return {
    name: 'orchard-client-studio-boundary',
    apply: 'build',
    generateBundle(_options, bundle) {
      const forbidden = [...new Set(Object.values(bundle)
        .flatMap(output => output.type === 'chunk' ? output.moduleIds : [])
        .map(id => id.replaceAll('\\', '/').split('?')[0]!)
        .filter(id => {
          if (/\/packages\/studio\/src\//.test(id)) return true;
          if (/\/packages\/ui\/src\/(?:studio-entry\.ts|studio\/spatial-art\.ts)$/.test(id)) return true;
          const kit = id.match(/\/packages\/ui\/src\/kit\/(.+)$/)?.[1];
          if (kit === undefined) return false;
          // Production imports concrete shared components, never the Studio/lab
          // barrels or their authored demo models. Check every emitted chunk.
          if (/^(?:lab\/|index\.ts$)/.test(kit) || /\.test\.ts$/.test(kit)) return true;
          if (/^(?:components\/(?:index|workbench|frame-designer|game-surface|layer-inspector|layer-row|schema-form|reference-picker)|runtime\/(?:frame-designer|recording-canvas))\.ts$/.test(kit)) return true;
          return kit !== 'tokens.ts' && !/^(?:components|runtime|layout|skin)\//.test(kit);
        }))].sort();
      if (forbidden.length > 0) {
        this.error(`Studio modules leaked into the game build. Keep @orchard/ui/studio imports in Studio:\n${forbidden.join('\n')}`);
      }
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const chunkMode = loadEnv(mode, '../..', 'VITE_').VITE_CHUNK_RUNTIME_MODE ?? 'off';
  chunkRuntimeBuildAudit(chunkMode, []);
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
    clientStudioBoundary(),
    // /world/<space>/<hash>.bin from ORCHARD_WORLD_CHUNK_DIR (never dist): see ops/orchard-runtime/README.md.
    worldChunkServing(),
    { name: 'orchard-chunk-runtime-audit', apply: 'build', generateBundle(_options, bundle) {
      const audit = chunkRuntimeBuildAudit(chunkMode, Object.values(bundle).flatMap(output => output.type === 'chunk' ? output.moduleIds : []));
      this.emitFile({type:'asset',fileName:'chunk-runtime-audit.json',source:JSON.stringify(audit)});
    } },
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
    ...clientListenOptions,
    proxy: clientProxy,
  },
  preview: {
    ...clientListenOptions,
    proxy: clientProxy,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 250,
    rolldownOptions: {
      input: 'index.html',
      output: {
        codeSplitting: {
          minSize: 10_000,
          groups: [
            {
              name: 'spacetime-runtime',
              test: /node_modules\/(?:spacetimedb|safe-stable-stringify|base64-js)\//,
            },
            { name: 'webgl-world', includeDependenciesRecursively: false, test: /packages\/engine\/src\/webgl\/(?!hooks\.ts$)/ },
            { name: 'world-bindings', test: /packages\/world-bindings\/src\// },
            { name: 'simulation', test: /packages\/sim\/src\// },
            { name: 'client-network', test: /packages\/client\/src\/net\// },
            {
              name: 'game-ui',
              test: /packages\/ui\/src\/(?!(?:assets|pixel-ui|sprite)\.ts$)/,
            },
            {
              name: 'canvas-rendering',
              test: /packages\/(?:engine\/src\/(?!(?:(?:display|editor-terrain|loading-screen|terrain-inspector)\.ts$|webgl\/(?!hooks\.ts$)))|ui\/src\/(?:assets|pixel-ui|sprite)\.ts$)/,
            },
          ],
        },
      },
    },
  },
  });
});
