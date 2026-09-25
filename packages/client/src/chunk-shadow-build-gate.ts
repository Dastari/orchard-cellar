/**
 * Client build gate for the chunk runtime (static world S4a).
 *
 * Self-contained on purpose: vite.config.ts loads it before workspace sources resolve.
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
 * preview port (S4g). Its audit always says activationAllowed: false, and the guarded
 * release scripts build with `--mode client-production`, so it cannot ship by accident.
 */
export const CHUNK_RUNTIME_PREVIEW_BUILD_MODE = 'chunk-runtime-preview';

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
