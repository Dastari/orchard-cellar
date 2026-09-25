/**
 * Client build gate for the chunk runtime (static world S4a).
 *
 * Self-contained on purpose (no imports, erasable TypeScript only): vite.config.ts loads it
 * before workspace sources resolve, and ops/orchard-runtime/bin/validate-client-static.sh
 * imports it with plain `node` (type stripping) to validate the release artifact.
 * Keep the mode list in step with CHUNK_RUNTIME_MODES in @orchard/sim/chunk-runtime.
 */
export const CHUNK_RUNTIME_BUILD_MODES = ['off', 'shadow', 'on'] as const;
export type ChunkRuntimeBuildMode = typeof CHUNK_RUNTIME_BUILD_MODES[number];

/**
 * The one reviewed release that may ship an `on` client to players.
 *
 * `null` means no release is approved, so every production build refuses `on`.
 * The S5c activation PR sets this to its release id, and the release build must also
 * export the same id in ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE. Changing this line
 * is the activation decision: it needs its own review, separate from runtime code.
 */
export const CHUNK_RUNTIME_ACTIVATION_RELEASE: string | null = null;

/** Build-time environment variable naming the approved release (never exposed to the bundle). */
export const CHUNK_RUNTIME_ACTIVATION_ENV = 'ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE';

/**
 * The only Vite build mode that may produce an unapproved `on` bundle, for a manual
 * preview port (S4g). Its audit always says activationAllowed: false. It builds into
 * CHUNK_RUNTIME_PREVIEW_OUT_DIR, never `dist` (which the live frontend serves), and a
 * default `vite preview` never serves that directory.
 */
export const CHUNK_RUNTIME_PREVIEW_BUILD_MODE = 'chunk-runtime-preview';
export const CHUNK_RUNTIME_PREVIEW_OUT_DIR = 'dist-chunk-preview';

/** Client build output directory for a Vite mode. */
export function clientBuildOutDir(viteMode: string): string {
  return viteMode === CHUNK_RUNTIME_PREVIEW_BUILD_MODE ? CHUNK_RUNTIME_PREVIEW_OUT_DIR : 'dist';
}

export function parseChunkRuntimeBuildMode(raw: string | undefined): ChunkRuntimeBuildMode {
  const mode = raw ?? '';
  if (mode === '') return 'off';
  if (!(CHUNK_RUNTIME_BUILD_MODES as readonly string[]).includes(mode)) throw new Error('chunk_runtime_mode_invalid');
  return mode as ChunkRuntimeBuildMode;
}

export interface ChunkRuntimeBuildOptions {
  /** True for every `vite build` except the preview build mode. Dev servers pass false. */
  readonly production?: boolean;
  /** Value of ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE, if set. */
  readonly activationRelease?: string | undefined;
  readonly requireGeneratorFree?: boolean;
  /** Test seam only; production code always uses CHUNK_RUNTIME_ACTIVATION_RELEASE. */
  readonly approvedRelease?: string | null;
}

export interface ChunkRuntimeBuildAudit {
  readonly schema: 1;
  readonly mode: ChunkRuntimeBuildMode;
  readonly legacyModules: readonly string[];
  /** True only for an `on` build carrying the reviewed activation release id. */
  readonly activationAllowed: boolean;
  readonly activationRelease: string | null;
}

/** Whether a build may ship `on` to players: both keys must be present and agree. */
export function chunkRuntimeActivationApproved(mode: ChunkRuntimeBuildMode, activationRelease: string | undefined,
  approvedRelease: string | null = CHUNK_RUNTIME_ACTIVATION_RELEASE): boolean {
  return mode === 'on' && approvedRelease !== null && approvedRelease !== '' && activationRelease === approvedRelease;
}

/** Module identities survive minification; checking function strings would not. */
export function chunkRuntimeBuildAudit(rawMode: string | undefined, moduleIds: readonly string[], options: ChunkRuntimeBuildOptions = {}): ChunkRuntimeBuildAudit {
  const mode = parseChunkRuntimeBuildMode(rawMode);
  const approvedRelease = options.approvedRelease === undefined ? CHUNK_RUNTIME_ACTIVATION_RELEASE : options.approvedRelease;
  const release = options.activationRelease === '' ? undefined : options.activationRelease;
  const activationAllowed = chunkRuntimeActivationApproved(mode, release, approvedRelease);
  // A stray or mismatched release id is an error, never silently ignored.
  if (release !== undefined && !activationAllowed) throw new Error('chunk_runtime_activation_release_mismatch');
  if (mode === 'on' && options.production === true && !activationAllowed) throw new Error('chunk_runtime_activation_not_approved');
  const legacyModules = [...new Set(moduleIds.map(id=>id.replaceAll('\\','/').split('?')[0]!)
    .filter(id=>/\/packages\/(?:sim\/src\/(?:procedural-terrain|survival-world|map-compiler)[^/]*|engine\/src\/(?:terrain|live-map-runtime))\.ts$/u.test(id)))].sort();
  if (options.requireGeneratorFree === true && legacyModules.length) throw new Error(`chunk_generator_retirement_incomplete: ${legacyModules.join(', ')}`);
  return { schema: 1, mode, legacyModules, activationAllowed, activationRelease: activationAllowed ? release! : null };
}

/**
 * `production`: an artifact that may be served to players. An `on` build is valid only when
 * it carries the approved activation (so an unapproved preview or dev-style `on` audit fails
 * every release validator). `preview`: the chunk-runtime-preview artifact, which may be `on`
 * but never activation-approved.
 */
export type ChunkRuntimeArtifact = 'production' | 'preview';

export function validChunkRuntimeBuildAudit(audit: unknown, artifact: ChunkRuntimeArtifact = 'production',
  approvedRelease: string | null = CHUNK_RUNTIME_ACTIVATION_RELEASE): audit is ChunkRuntimeBuildAudit {
  if (audit === null || typeof audit !== 'object' || Array.isArray(audit)) return false;
  const { schema, mode, activationAllowed, activationRelease, legacyModules } = audit as Record<string, unknown>;
  if (schema !== 1 || !(CHUNK_RUNTIME_BUILD_MODES as readonly unknown[]).includes(mode)
    || !Array.isArray(legacyModules) || !legacyModules.every(id => typeof id === 'string')) return false;
  if (activationAllowed === false) {
    // Audits written before S4a have no activationRelease field.
    if (activationRelease !== undefined && activationRelease !== null) return false;
    return artifact === 'preview' || mode !== 'on';
  }
  return artifact === 'production' && activationAllowed === true
    && typeof activationRelease === 'string' && chunkRuntimeActivationApproved(mode as ChunkRuntimeBuildMode, activationRelease, approvedRelease);
}
