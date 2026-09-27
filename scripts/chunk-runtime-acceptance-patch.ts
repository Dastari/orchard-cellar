/**
 * Static-world S4g: build-time source patches for the chunk-runtime browser acceptance
 * (applied by scripts/chunk-runtime-acceptance.vite.config.ts to a LOCAL acceptance build
 * only; never to a release build, which uses packages/client/vite.config.ts directly).
 *
 * Each patch replaces one exact anchor. An anchor that is missing or not unique fails the
 * build, so a source change can never silently turn the acceptance into a no-op. The two bug
 * workarounds (BUG-053 seam, BUG-055 gate) are the exception: they apply only while their
 * anchor still exists, and the driver records whether the build needed them.
 *
 * - Local profiles in a production (PROD) build: the disposable world has production
 *   OIDC switched off, and a DEV build would not register the service worker or minify
 *   like a release build does.
 * - The chunk-authority seam: on main the client never reads the server's chunkAuthority
 *   (UNCONNECTED_CHUNK_AUTHORITY, BUG-053), so an `on` build only ever runs `shadow`. With
 *   S4G_CHUNK_AUTHORITY=on the build gets a hook the driver sets to the world's switch.
 * - The authority gate (BUG-054): a runtime switch the driver sets once it has recorded main's
 *   behaviour, so chunk collision and map records can serve as designed.
 * - A read-only store probe on `window.__orchardOverworld` (resident chunks and bytes,
 *   installs, pins, limits) for occupancy and eviction evidence.
 */

export interface AcceptanceBuildEnvironment {
  readonly outDir: string;
  readonly previewPort: number;
  readonly worldHost: string;
  readonly database: string;
  /** `on`: install the seam hook (SEAM_HOOK); null leaves the seam exactly as on main. */
  readonly chunkAuthority: 'off' | 'shadow' | 'on' | null;
}

export class AcceptancePatchError extends Error {}

const PRODUCTION_DATABASE = 'orchard-cellar-world';
const PRODUCTION_HOST_PORT = '3000';

function loopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(hostname);
}

/** Refuses anything but a disposable loopback world (never port 3000 or the production database). */
export function assertAcceptanceBuildEnvironment(env: Readonly<Record<string, string | undefined>>): AcceptanceBuildEnvironment {
  const outDir = env['S4G_OUT_DIR'] ?? '';
  const previewPort = Number(env['S4G_PREVIEW_PORT'] ?? '');
  const worldHost = env['S4G_WORLD_HOST'] ?? '';
  const database = env['VITE_SPACETIMEDB_DATABASE'] ?? '';
  const authority = env['S4G_CHUNK_AUTHORITY'] ?? '';
  if (!outDir.startsWith('/')) throw new AcceptancePatchError('s4g_out_dir_must_be_absolute');
  if (/\/packages\/client\/dist(?:-chunk-preview)?\/?$/u.test(outDir)) throw new AcceptancePatchError('s4g_out_dir_must_not_be_a_client_dist');
  if (!Number.isSafeInteger(previewPort) || previewPort < 1024 || previewPort > 65535 || previewPort === 5173) {
    throw new AcceptancePatchError('s4g_preview_port_invalid');
  }
  let url: URL;
  try { url = new URL(worldHost); } catch { throw new AcceptancePatchError('s4g_world_host_invalid'); }
  if (url.protocol !== 'http:' || !loopback(url.hostname) || url.port === '' || url.port === PRODUCTION_HOST_PORT) {
    throw new AcceptancePatchError('s4g_world_host_must_be_disposable_loopback');
  }
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/u.test(database) || database === PRODUCTION_DATABASE) {
    throw new AcceptancePatchError('s4g_database_must_be_disposable');
  }
  if ((env['VITE_SPACETIMEDB_URI'] ?? '') !== '') throw new AcceptancePatchError('s4g_client_must_use_the_preview_proxy');
  if ((env['VITE_OIDC_CLIENT_ID'] ?? '') !== '') throw new AcceptancePatchError('s4g_oidc_must_be_off');
  if (authority !== '' && authority !== 'off' && authority !== 'shadow' && authority !== 'on') throw new AcceptancePatchError('s4g_chunk_authority_invalid');
  return { outDir, previewPort, worldHost: url.origin, database, chunkAuthority: authority === '' ? null : authority };
}

interface Replacement { readonly anchor: string; readonly replacement: string }

function replaceOnce(file: string, code: string, { anchor, replacement }: Replacement): string {
  const first = code.indexOf(anchor);
  if (first < 0 || code.indexOf(anchor, first + 1) >= 0) throw new AcceptancePatchError(`s4g_patch_anchor_${first < 0 ? 'missing' : 'not_unique'}: ${file}`);
  return code.slice(0, first) + replacement + code.slice(first + anchor.length);
}

export const LOCAL_PROFILES_ANCHOR = 'export const localProfilesEnabled = import.meta.env.DEV\n';
export const SEAM_ANCHOR = 'this.chunkRuntime ??= new ChunkRuntimeController({ buildMode: this.chunkRuntimeMode,';
export const PROBE_ANCHOR = 'Object.assign(window, {\n  __orchardOverworld: {\n';
export const GATE_ANCHOR = "    return this.chunkRuntime?.authorityGate(this.chunkRuntimeSource()) ?? 'not_on';\n";
/**
 * BUG-054: `?? 'not_on'` also turns the controller's `null` ("the serving revision may stand in
 * for the server") into `not_on`, so chunk collision and map records never serve. With
 * `globalThis.__s4gGateFix` the acceptance build returns the controller's answer unchanged;
 * the driver records the unfixed behaviour first.
 */
export const GATE_FIX = "    if ((globalThis as { __s4gGateFix?: boolean }).__s4gGateFix === true) return this.chunkRuntime === undefined ? 'not_on' : this.chunkRuntime.authorityGate(this.chunkRuntimeSource());\n";
/**
 * The seam hook: the authority is whatever the acceptance driver sets on
 * `globalThis.__s4gChunkAuthority`, and undefined (exactly main's unconnected seam) until then.
 * The driver first records the unset behaviour, then sets `on`, the disposable world's switch.
 */
export const SEAM_HOOK = "authority: () => (globalThis as { __s4gChunkAuthority?: 'off' | 'shadow' | 'on' }).__s4gChunkAuthority,";

/** The store probe: plain numbers only, so it never keeps a store alive or changes behaviour. */
const PROBE = `    s4gChunkStore: (() => {
      const ids = new WeakMap<object, number>(); let next = 0;
      return () => {
        const store = network.chunkTerrainStore;
        if (store === undefined) return null;
        const gate = network.chunkAuthorityGate();
        let id = ids.get(store); if (id === undefined) { id = ++next; ids.set(store, id); }
        return { id, gate, residentCount: store.residentCount, residentBytes: store.residentBytes, installs: store.installs,
          pinned: store.pinnedKeys.length, pinnedKeys: store.pinnedKeys, maxChunks: store.maxChunks, maxBytes: store.maxBytes, manifestChunks: store.manifest.chunks.length };
      };
    })(),
`;

/** Returns the patched source for the files the acceptance changes, or null for every other file. */
export function acceptancePatch(id: string, code: string, settings: Pick<AcceptanceBuildEnvironment, 'chunkAuthority'>): string | null {
  if (id.endsWith('/packages/auth/src/oidc.ts')) {
    return replaceOnce(id, code, { anchor: LOCAL_PROFILES_ANCHOR, replacement: 'export const localProfilesEnabled = true\n' });
  }
  if (id.endsWith('/packages/client/src/net/overworld-connection.ts')) {
    if (settings.chunkAuthority === null) return null;
    // Once BUG-053 / BUG-055 are fixed on main their anchors are gone and the build runs the real code.
    const seamed = code.includes(SEAM_ANCHOR) ? replaceOnce(id, code, { anchor: SEAM_ANCHOR, replacement: `${SEAM_ANCHOR} ${SEAM_HOOK}` }) : code;
    return seamed.includes(GATE_ANCHOR) ? replaceOnce(id, seamed, { anchor: GATE_ANCHOR, replacement: `${GATE_FIX}${GATE_ANCHOR}` }) : seamed;
  }
  if (id.endsWith('/packages/client/src/overworld-main.ts')) {
    return replaceOnce(id, code, { anchor: PROBE_ANCHOR, replacement: `${PROBE_ANCHOR}${PROBE}` });
  }
  return null;
}
