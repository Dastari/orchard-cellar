import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin, type UserConfig } from 'vite';
import clientConfig from '../packages/client/vite.config.ts';
import { acceptancePatch, assertAcceptanceBuildEnvironment, type AcceptanceBuildEnvironment } from './chunk-runtime-acceptance-patch.ts';

/**
 * Static-world S4g: the game client's own Vite config, wrapped for the browser acceptance
 * (scripts/run-chunk-runtime-browser-acceptance.sh). LOCAL, DISPOSABLE WORLDS ONLY.
 *
 * - Builds `packages/client` into an absolute S4G_OUT_DIR (never `dist`), in the
 *   `chunk-runtime-preview` mode, so an `on` build is never activation-approved.
 * - `vite preview` with this config listens on 127.0.0.1:S4G_PREVIEW_PORT and proxies
 *   `/v1` to the disposable S4G_WORLD_HOST (never the production host on port 3000).
 * - The acceptance transform (chunk-runtime-acceptance-patch.ts) enables local profiles in
 *   this production build, installs a chunk-authority seam hook the driver sets (the client's
 *   seam is still unconnected on main, BUG-053), and adds a read-only store probe.
 */
const clientRoot = fileURLToPath(new URL('../packages/client/', import.meta.url));

export default defineConfig(async (env) => {
  const settings: AcceptanceBuildEnvironment = assertAcceptanceBuildEnvironment(process.env);
  const base = (typeof clientConfig === 'function' ? await clientConfig(env) : clientConfig) as UserConfig;
  const patch: Plugin = {
    name: 'orchard-s4g-acceptance',
    enforce: 'pre',
    transform(code, id) {
      const patched = acceptancePatch(id.split('?')[0]!.replaceAll('\\', '/'), code, settings);
      return patched === null ? null : { code: patched, map: null };
    },
  };
  const outDir = settings.outDir;
  if (!isAbsolute(outDir)) throw new Error('s4g_out_dir_must_be_absolute');
  return {
    ...base,
    root: clientRoot,
    envDir: resolve(clientRoot, '../..'),
    plugins: [patch, ...(base.plugins ?? [])],
    build: { ...base.build, outDir, emptyOutDir: true },
    server: undefined,
    preview: {
      host: '127.0.0.1',
      port: settings.previewPort,
      strictPort: true,
      proxy: { '/v1': { target: settings.worldHost, ws: true } },
    },
  } satisfies UserConfig;
});
