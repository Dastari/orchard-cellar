import {
  RAISED_TERRAIN_EDGE_ROLES,
  RAISED_TERRAIN_INSET_ROLES,
  type RaisedTerrainFaceRow,
  type RaisedTerrainRampBankCourse,
  type RaisedTerrainTileSet,
} from '../raised-terrain-autotile.js';
import {
  TERRAIN_CLIFF_FAMILIES,
  TERRAIN_CLIFF_FAMILY_IDS,
  TERRAIN_SURFACE_FAMILIES,
  TERRAIN_SURFACE_FAMILY_IDS,
  terrainCliffTileSet,
  type CliffFamilyId,
} from '../terrain-tilesets.js';
import type {
  TilesetContentDefinition,
  TilesetDefinitionId,
  TilesetFaceRowDefinition,
  TilesetRoleFrameDefinition,
  TilesetRoleGroup,
  TilesetTransitionDefinition,
} from '../content/definitions.js';
import type {
  TerrainTransitionDirection,
  TerrainTransitionKind,
} from '../terrain-elevation.js';

export const TILESET_CONTENT_ENGINE_VERSION = 1 as const;

export const TILESET_REQUIRED_ROLES = Object.freeze({
  edge: RAISED_TERRAIN_EDGE_ROLES,
  inset: RAISED_TERRAIN_INSET_ROLES,
  ledge_edge: RAISED_TERRAIN_EDGE_ROLES,
  ledge_inset: RAISED_TERRAIN_INSET_ROLES,
} satisfies Readonly<Record<TilesetRoleGroup, readonly string[]>>);

export interface TilesetValidationFinding {
  readonly code:
    | 'invalid_tileset'
    | 'missing_tileset_variant'
    | 'invalid_tileset_transition'
    | 'invalid_asset_reference'
    | 'invalid_terrain_reference';
  readonly path: string;
  readonly message: string;
}

class ImmutableTilesetMap<K, V> implements ReadonlyMap<K, V> {
  readonly #source: Map<K, V>;

  constructor(entries: Iterable<readonly [K, V]>) {
    this.#source = new Map(entries);
    Object.freeze(this);
  }

  get size(): number { return this.#source.size; }
  get(key: K): V | undefined { return this.#source.get(key); }
  has(key: K): boolean { return this.#source.has(key); }
  entries(): MapIterator<[K, V]> { return this.#source.entries(); }
  keys(): MapIterator<K> { return this.#source.keys(); }
  values(): MapIterator<V> { return this.#source.values(); }
  [Symbol.iterator](): MapIterator<[K, V]> { return this.#source[Symbol.iterator](); }
  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#source) callbackfn.call(thisArg, value, key, this);
  }
}

export interface TilesetRegistry {
  readonly definitions: ReadonlyMap<TilesetDefinitionId, TilesetContentDefinition>;
  readonly byFamily: ReadonlyMap<string, TilesetContentDefinition>;
  readonly contentHash: string;
}

export interface RuntimeTilesetResolver {
  readonly familyIds: readonly string[];
  tileSetFor(familyId: string): RaisedTerrainTileSet | null;
}

export type TerrainTransitionCapabilityCode =
  | 'transition_supported'
  | 'transition_direction_art_unavailable'
  | 'transition_family_art_unavailable'
  | 'transition_bank_width_unavailable'
  | 'transition_stair_art_unavailable'
  | 'transition_ladder_runtime_unavailable'
  | 'transition_kind_runtime_unavailable';

export type TerrainTransitionCapability = Readonly<{
  supported: true;
  code: 'transition_supported';
  message: string;
}> | Readonly<{
  supported: false;
  code: Exclude<TerrainTransitionCapabilityCode, 'transition_supported'>;
  message: string;
}>;

export interface TerrainTransitionCapabilityRequest {
  readonly kind: TerrainTransitionKind;
  readonly direction: TerrainTransitionDirection;
  readonly familyId: string;
  /** Current composable ramp banks require at least two contiguous lanes. */
  readonly width?: number;
  readonly tilesets?: RuntimeTilesetResolver;
}

/** Exact transition capability shared by publication and authoring.
 *
 * This is deliberately narrower than movement authority: cardinal movement
 * already understands every direction, but the shipped painter has only a
 * north/up multi-lane slope-bank contract. Stairs must not silently borrow
 * slope art, and ladder/rope semantics have no traversable runtime authority.
 */
export function terrainTransitionCapability(
  request: TerrainTransitionCapabilityRequest,
): TerrainTransitionCapability {
  const { kind, direction, familyId, width = 2, tilesets } = request;
  if (kind === 'stairs') return {
    supported: false,
    code: 'transition_stair_art_unavailable',
    message: `Cliff family ${familyId} has no dedicated registered stair art and painter contract.`,
  };
  if (kind === 'ladder') return {
    supported: false,
    code: 'transition_ladder_runtime_unavailable',
    message: 'Ladders have no traversable runtime authority or directional art contract.',
  };
  if (kind !== 'slope') return {
    supported: false,
    code: 'transition_kind_runtime_unavailable',
    message: `Transition kind ${kind} has no reproducible runtime art and authority contract.`,
  };
  if (direction !== 'up') return {
    supported: false,
    code: 'transition_direction_art_unavailable',
    message: `Slope direction ${direction} has no exact registered directional art contract; only north/up is available.`,
  };
  if (!Number.isInteger(width) || width < 2) return {
    supported: false,
    code: 'transition_bank_width_unavailable',
    message: 'Slope ramp-bank rendering requires at least two contiguous lanes.',
  };
  const tileSet = tilesets?.tileSetFor(familyId) ?? terrainCliffTileSet(familyId);
  if (tileSet === null || tileSet.rampBank === null) return {
    supported: false,
    code: 'transition_family_art_unavailable',
    message: `Cliff family ${familyId} has no registered north/up slope ramp-bank art.`,
  };
  if (tileSet.rampBank.crest.middle.length === 0 && width !== 2) return {
    supported: false,
    code: 'transition_bank_width_unavailable',
    message: `Cliff family ${familyId} has a fixed two-lane stair block (no middle lane art).`,
  };
  return {
    supported: true,
    code: 'transition_supported',
    message: `Cliff family ${familyId} supports a north/up slope bank.`,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (!Object.isFrozen(value)) Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(source[key])}`
  )).join(',')}}`;
}

export function tilesetDefinitionsHash(definitions: readonly TilesetContentDefinition[]): string {
  const canonical = [...definitions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(canonicalJson)
    .join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function courseFrames(course: RaisedTerrainRampBankCourse): readonly number[] {
  return [course.left, ...course.middle, course.right];
}

function sortedVariants(
  variants: readonly { readonly id: string; readonly frames: readonly number[] }[],
): readonly { readonly id: string; readonly frames: readonly number[] }[] {
  return [...variants].sort((left, right) => left.id.localeCompare(right.id));
}

function transition(
  tileSet: RaisedTerrainTileSet,
  kind: 'ramp' | 'stair' | 'ladder',
): TilesetTransitionDefinition {
  if (kind === 'ramp' && tileSet.rampBank !== null) {
    return {
      available: true,
      assetId: tileSet.rampBank.assetId,
      variants: sortedVariants([
        { id: 'crest', frames: courseFrames(tileSet.rampBank.crest) },
        ...tileSet.rampBank.treads.map((course, index) => ({ id: `tread.${index}`, frames: courseFrames(course) })),
        { id: 'base', frames: courseFrames(tileSet.rampBank.base) },
      ]),
    };
  }
  if (kind === 'ramp' && Object.keys(tileSet.rampFrames).length > 0) {
    return {
      available: true,
      assetId: tileSet.rampAssetId ?? tileSet.assetId,
      variants: sortedVariants(Object.entries(tileSet.rampFrames).flatMap(([id, frame]) => (
        frame === undefined ? [] : [{ id, frames: [frame] }]
      ))),
    };
  }
  if (kind === 'stair' && tileSet.stairFrames !== null) {
    return {
      available: true,
      assetId: tileSet.stairAssetId ?? tileSet.assetId,
      variants: sortedVariants([
        { id: 'top', frames: tileSet.stairFrames.top },
        { id: 'middle', frames: tileSet.stairFrames.middle },
        { id: 'bottom', frames: tileSet.stairFrames.bottom },
      ]),
    };
  }
  if (kind === 'ladder' && tileSet.ladderFrames !== null) {
    return {
      available: true,
      assetId: tileSet.ladderAssetId ?? tileSet.assetId,
      variants: [{ id: 'ladder', frames: tileSet.ladderFrames }],
    };
  }
  return {
    available: false,
    reason: `No authored ${kind} variants are available for this source family.`,
  };
}

function roleFrames(tileSet: RaisedTerrainTileSet): readonly TilesetRoleFrameDefinition[] {
  const roles: TilesetRoleFrameDefinition[] = [];
  function append(
    group: TilesetRoleGroup,
    assetId: string,
    frames: Readonly<Record<string, number | undefined>>,
  ): void {
    for (const [role, frame] of Object.entries(frames)) {
      if (frame !== undefined) roles.push({ group, role, assetId, frame });
    }
  }
  append('edge', tileSet.assetId, tileSet.edgeFrames);
  append('inset', tileSet.insetAssetId ?? tileSet.assetId, tileSet.insetFrames);
  if (tileSet.ledgeBank !== null && tileSet.ledgeBank !== undefined) {
    append('ledge_edge', tileSet.ledgeBank.assetId, tileSet.ledgeBank.edgeFrames);
    append('ledge_inset', tileSet.ledgeBank.assetId, tileSet.ledgeBank.insetFrames);
  }
  return roles.sort((left, right) => `${left.group}:${left.role}`.localeCompare(`${right.group}:${right.role}`));
}

function faceRow(assetId: string, row: RaisedTerrainFaceRow): TilesetFaceRowDefinition {
  return {
    id: row.id,
    assetId,
    frames: row.frames,
    blocksMovement: row.blocksMovement,
    blocksLight: row.blocksLight,
    ...(row.contributesHeight === undefined ? {} : { contributesHeight: row.contributesHeight }),
    ...(row.middleVariants === undefined ? {} : { middleVariants: row.middleVariants }),
  };
}

function surfaceFamilyFor(tileSet: RaisedTerrainTileSet): string | undefined {
  return TERRAIN_SURFACE_FAMILY_IDS.find((id) => {
    const surface = TERRAIN_SURFACE_FAMILIES[id];
    return tileSet.ledgeBank === surface.ledgeBank
      || tileSet.rampBank === surface.rampBanks.stone
      || tileSet.rampBank === surface.rampBanks.wood;
  });
}

function assetsFor(tileSet: RaisedTerrainTileSet, roles: readonly TilesetRoleFrameDefinition[]): readonly string[] {
  const transitionAssets = (['ramp', 'stair', 'ladder'] as const)
    .map((kind) => transition(tileSet, kind))
    .flatMap((entry) => entry.available ? [entry.assetId] : []);
  return [...new Set([
    tileSet.assetId,
    ...roles.map(({ assetId }) => assetId),
    ...transitionAssets,
    ...(tileSet.waterfallAssetId === undefined ? [] : [tileSet.waterfallAssetId]),
  ])].sort((left, right) => left.localeCompare(right));
}

function bootstrapDefinition(familyId: CliffFamilyId, tileSet: RaisedTerrainTileSet): TilesetContentDefinition {
  const roles = roleFrames(tileSet);
  const populatedGroups = new Set(roles.map(({ group }) => group));
  const unavailableRoleGroups = (['inset', 'ledge_edge', 'ledge_inset'] as const)
    .filter((group) => !populatedGroups.has(group))
    .map((group) => ({
      group,
      reason: group.startsWith('ledge')
        ? 'No separate authored ledge bank exists for this source family.'
        : 'No authored inverse inset variants exist for this source family.',
    }));
  return deepFreeze({
    id: `tileset:${familyId}`,
    kind: 'tileset',
    schemaVersion: 1,
    engineVersion: TILESET_CONTENT_ENGINE_VERSION,
    familyId,
    projectionStyle: tileSet.projectionStyle,
    baseDatum: tileSet.baseDatum ?? 0,
    ...(tileSet.fixedPlane === undefined ? {} : { fixedPlane: tileSet.fixedPlane }),
    ...(tileSet.projectionRowsPerLevel === undefined ? {} : {
      projectionRowsPerLevel: tileSet.projectionRowsPerLevel,
    }),
    faceClearanceRows: tileSet.faceClearanceRows ?? 0,
    ...(surfaceFamilyFor(tileSet) === undefined ? {} : { surfaceFamily: surfaceFamilyFor(tileSet)! }),
    roleFrames: roles,
    unavailableRoleGroups,
    faceProfiles: Object.entries(tileSet.faceProfiles)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, profile]) => ({
        id,
        rows: profile.rows.map((row) => faceRow(tileSet.assetId, row)),
        repeatRows: (profile.repeatRows ?? (profile.repeatRow === undefined ? [] : [profile.repeatRow]))
          .map((row) => faceRow(tileSet.assetId, row)),
      })),
    transitions: {
      ramp: transition(tileSet, 'ramp'),
      stair: transition(tileSet, 'stair'),
      ladder: transition(tileSet, 'ladder'),
    },
    assetIds: assetsFor(tileSet, roles),
  } satisfies TilesetContentDefinition);
}

const BOOTSTRAP_TILESETS = deepFreeze(TERRAIN_CLIFF_FAMILY_IDS.flatMap((familyId) => {
  const family = TERRAIN_CLIFF_FAMILIES[familyId];
  return family.available ? [bootstrapDefinition(familyId, family.tileSet)] : [];
}).sort((left, right) => left.id.localeCompare(right.id)));

export const RESERVED_TILESET_FAMILIES = deepFreeze(TERRAIN_CLIFF_FAMILY_IDS.flatMap((familyId) => {
  const family = TERRAIN_CLIFF_FAMILIES[familyId];
  return family.available ? [] : [{ familyId, reason: family.reason }];
}));

export function bootstrapTilesetDefinitions(): readonly TilesetContentDefinition[] {
  return BOOTSTRAP_TILESETS;
}

export function buildTilesetRegistry(definitions: readonly TilesetContentDefinition[]): TilesetRegistry {
  const sorted = [...definitions].sort((left, right) => left.id.localeCompare(right.id));
  const ids = new Set<string>();
  const families = new Set<string>();
  for (const definition of sorted) {
    if (ids.has(definition.id)) throw new Error(`duplicate_tileset_id:${definition.id}`);
    if (families.has(definition.familyId)) throw new Error(`duplicate_tileset_family:${definition.familyId}`);
    ids.add(definition.id);
    families.add(definition.familyId);
  }
  return Object.freeze({
    definitions: new ImmutableTilesetMap(sorted.map((definition) => [definition.id, definition] as const)),
    byFamily: new ImmutableTilesetMap(sorted.map((definition) => [definition.familyId, definition] as const)),
    contentHash: tilesetDefinitionsHash(sorted),
  });
}

function roleMap(
  definition: TilesetContentDefinition,
  group: TilesetRoleGroup,
): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(definition.roleFrames
    .filter((entry) => entry.group === group)
    .map((entry) => [entry.role, entry.frame])));
}

function roleAsset(definition: TilesetContentDefinition, group: TilesetRoleGroup): string | undefined {
  return definition.roleFrames.find((entry) => entry.group === group)?.assetId;
}

/** Three or more frames: left rail, repeatable middle, right rail. Exactly two:
 * a fixed two-lane stair block (basic's brown-rim stairs) with no middle lane. */
function rampCourse(frames: readonly number[] | undefined): RaisedTerrainRampBankCourse | null {
  if (frames === undefined || frames.length < 2) return null;
  return { left: frames[0]!, middle: frames.slice(1, -1), right: frames[frames.length - 1]! };
}

/** Projects the JSON schema back into the renderer contract. Fields which the
 * v1 payload does not carry retain the bootstrap family's engine metadata, so
 * editing art remains hot while old collision/projection semantics stay exact. */
export function runtimeTileSetFromDefinition(definition: TilesetContentDefinition): RaisedTerrainTileSet {
  const legacy = terrainCliffTileSet(definition.familyId);
  const edgeFrames = roleMap(definition, 'edge');
  const insetFrames = roleMap(definition, 'inset');
  const ledgeEdgeFrames = roleMap(definition, 'ledge_edge');
  const ledgeInsetFrames = roleMap(definition, 'ledge_inset');
  const ramp = definition.transitions.ramp;
  const rampCrest = ramp.available ? rampCourse(ramp.variants.find(({ id }) => id === 'crest')?.frames) : null;
  const rampBase = ramp.available ? rampCourse(ramp.variants.find(({ id }) => id === 'base')?.frames) : null;
  const rampTreads = ramp.available ? ramp.variants.filter(({ id }) => id.startsWith('tread.'))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ frames }) => rampCourse(frames)).filter((course): course is RaisedTerrainRampBankCourse => course !== null) : [];
  const stair = definition.transitions.stair;
  const stairCourse = (id: string): readonly [number, number] | null => {
    if (!stair.available) return null;
    const frames = stair.variants.find((variant) => variant.id === id)?.frames;
    return frames?.length === 2 ? [frames[0]!, frames[1]!] : null;
  };
  const stairTop = stairCourse('top'); const stairMiddle = stairCourse('middle'); const stairBottom = stairCourse('bottom');
  const ladder = definition.transitions.ladder;
  const primaryAsset = roleAsset(definition, 'edge') ?? definition.assetIds[0] ?? legacy?.assetId;
  const insetAsset = roleAsset(definition, 'inset');
  const ledgeBank: NonNullable<RaisedTerrainTileSet['ledgeBank']> | null = Object.keys(ledgeEdgeFrames).length === 0
    || Object.keys(ledgeInsetFrames).length === 0 ? legacy?.ledgeBank ?? null : {
      assetId: roleAsset(definition, 'ledge_edge') ?? primaryAsset,
      edgeFrames: ledgeEdgeFrames,
      insetFrames: ledgeInsetFrames,
    } as NonNullable<RaisedTerrainTileSet['ledgeBank']>;
  if (primaryAsset === undefined) throw new Error(`tileset_primary_asset_missing:${definition.id}`);
  return deepFreeze({
    assetId: primaryAsset,
    ...(insetAsset === undefined ? {} : { insetAssetId: insetAsset }),
    ...(ramp.available ? { rampAssetId: ramp.assetId } : {}),
    ...(stair.available ? { stairAssetId: stair.assetId } : {}),
    ...(ladder.available ? { ladderAssetId: ladder.assetId } : {}),
    projectionStyle: definition.projectionStyle,
    baseDatum: definition.baseDatum,
    ...(definition.fixedPlane === undefined ? {} : { fixedPlane: definition.fixedPlane }),
    ...(definition.projectionRowsPerLevel === undefined ? {} : { projectionRowsPerLevel: definition.projectionRowsPerLevel }),
    faceClearanceRows: definition.faceClearanceRows,
    edgeFrames,
    insetFrames,
    rampFrames: ramp.available ? {
      ...(rampCrest === null ? {} : { ramp_top_left: rampCrest.left, ramp_top_middle: rampCrest.middle[0], ramp_top_right: rampCrest.right }),
      ...(rampBase === null ? {} : { ramp_bottom_left: rampBase.left, ramp_bottom_middle: rampBase.middle[0], ramp_bottom_right: rampBase.right }),
    } : {},
    rampBank: !ramp.available || rampCrest === null || rampBase === null
      || (rampTreads.length === 0 && rampCrest.middle.length > 0)
      ? null : { assetId: ramp.assetId, crest: rampCrest, treads: rampTreads, base: rampBase },
    ledgeBank,
    stairFrames: stairTop === null || stairMiddle === null || stairBottom === null
      ? null : { top: stairTop, middle: stairMiddle, bottom: stairBottom },
    ladderFrames: ladder.available ? ladder.variants.flatMap(({ frames }) => frames) : null,
    faceProfiles: Object.freeze(Object.fromEntries(definition.faceProfiles.map((profile) => [profile.id, {
      rows: profile.rows,
      ...(profile.repeatRows.length === 0 ? {} : { repeatRows: profile.repeatRows }),
    }]))),
    ...(legacy?.edgeBlocksMovement === undefined ? {} : { edgeBlocksMovement: legacy.edgeBlocksMovement }),
    ...(legacy?.edgeBlocksLight === undefined ? {} : { edgeBlocksLight: legacy.edgeBlocksLight }),
    ...(legacy?.edgeInsetMode === undefined ? {} : { edgeInsetMode: legacy.edgeInsetMode }),
  });
}

export function runtimeTilesetResolver(
  definitions: readonly TilesetContentDefinition[] | ReadonlyMap<string, TilesetContentDefinition>,
): RuntimeTilesetResolver {
  const values = definitions instanceof Map ? [...definitions.values()] : Array.isArray(definitions)
    ? definitions : [...definitions.values()];
  const active = values.filter((definition) => definition.retired !== true);
  const tileSets = new Map(active.map((definition) => [definition.familyId, runtimeTileSetFromDefinition(definition)] as const));
  return Object.freeze({ familyIds: Object.freeze([...tileSets.keys()].sort()),
    tileSetFor: (familyId: string) => tileSets.get(familyId) ?? terrainCliffTileSet(familyId) });
}

function finding(
  code: TilesetValidationFinding['code'],
  path: string,
  message: string,
): TilesetValidationFinding {
  return { code, path, message };
}

function validateTransition(
  kind: 'ramp' | 'stair' | 'ladder',
  definition: TilesetTransitionDefinition,
): readonly TilesetValidationFinding[] {
  if (!definition.available) return definition.reason.trim().length === 0
    ? [finding('invalid_tileset_transition', `transitions.${kind}.reason`, 'unavailable transition requires a reason')]
    : [];
  const errors: TilesetValidationFinding[] = [];
  const variants = new Map<string, readonly number[]>();
  for (const variant of definition.variants) {
    if (variants.has(variant.id)) {
      errors.push(finding('invalid_tileset_transition', `transitions.${kind}.variants`, `duplicate variant ${variant.id}`));
    }
    variants.set(variant.id, variant.frames);
    if (variant.frames.length === 0) {
      errors.push(finding('invalid_tileset_transition', `transitions.${kind}.${variant.id}`, 'variant has no frames'));
    }
  }
  if (kind === 'ramp') {
    const bankVariant = variants.has('crest') || variants.has('base')
      || [...variants.keys()].some((id) => id.startsWith('tread.'));
    if (bankVariant) {
      const treads = [...variants].filter(([id]) => id.startsWith('tread.'));
      // A fixed two-lane stair block: crest and base of exactly two frames and
      // no tread rows (a flat rim with no wall rows, e.g. the basic family).
      const fixedBlock = variants.get('crest')?.length === 2;
      if (fixedBlock) {
        if (variants.get('base')?.length !== 2) {
          errors.push(finding('invalid_tileset_transition', 'transitions.ramp.base', 'a two-lane stair block needs a two-frame base'));
        }
        if (treads.length > 0) {
          errors.push(finding('invalid_tileset_transition', 'transitions.ramp.variants', 'a two-lane stair block has no tread rows'));
        }
      } else {
        for (const id of ['crest', 'base']) {
          if ((variants.get(id)?.length ?? 0) < 3) {
            errors.push(finding('invalid_tileset_transition', `transitions.ramp.${id}`, `${id} requires left, middle, right frames`));
          }
        }
        if (treads.length === 0 || treads.some(([, frames]) => frames.length < 3)) {
          errors.push(finding('invalid_tileset_transition', 'transitions.ramp.variants', 'ramp requires a three-lane tread variant'));
        }
      }
    } else {
      const directRoles = [
        'ramp_top_left', 'ramp_top_middle', 'ramp_top_right',
        'ramp_bottom_left', 'ramp_bottom_middle', 'ramp_bottom_right',
      ];
      for (const id of directRoles) {
        if (variants.get(id)?.length !== 1) {
          errors.push(finding('invalid_tileset_transition', `transitions.ramp.${id}`, `${id} requires exactly one frame`));
        }
      }
    }
  } else if (kind === 'stair') {
    for (const id of ['top', 'middle', 'bottom']) {
      if (variants.get(id)?.length !== 2) {
        errors.push(finding('invalid_tileset_transition', `transitions.stair.${id}`, `${id} requires exactly two frames`));
      }
    }
  } else if ((variants.get('ladder')?.length ?? 0) < 1) {
    errors.push(finding('invalid_tileset_transition', 'transitions.ladder.ladder', 'ladder requires at least one frame'));
  }
  return errors;
}

export function validateTilesetDefinition(definition: TilesetContentDefinition): readonly TilesetValidationFinding[] {
  const errors: TilesetValidationFinding[] = [];
  if (definition.engineVersion !== TILESET_CONTENT_ENGINE_VERSION) {
    errors.push(finding('invalid_tileset', 'engineVersion', `unsupported tileset engine version ${definition.engineVersion}`));
  }
  if (definition.id !== `tileset:${definition.familyId}`) {
    errors.push(finding('invalid_terrain_reference', 'familyId', 'familyId must equal the stable definition id slug'));
  }
  if (definition.surfaceFamily !== undefined
    && !(TERRAIN_SURFACE_FAMILY_IDS as readonly string[]).includes(definition.surfaceFamily)) {
    errors.push(finding('invalid_terrain_reference', 'surfaceFamily', `unknown surface family ${definition.surfaceFamily}`));
  }
  const assets = new Set(definition.assetIds);
  if (assets.size !== definition.assetIds.length) {
    errors.push(finding('invalid_asset_reference', 'assetIds', 'asset manifest contains duplicates'));
  }
  const referencedAssets = [
    ...definition.roleFrames.map(({ assetId }) => assetId),
    ...definition.faceProfiles.flatMap(({ rows, repeatRows }) => [...rows, ...repeatRows].map(({ assetId }) => assetId)),
    ...Object.values(definition.transitions).flatMap((entry) => entry.available ? [entry.assetId] : []),
  ];
  for (const assetId of referencedAssets) {
    if (!assets.has(assetId)) {
      errors.push(finding('invalid_asset_reference', 'assetIds', `referenced asset is absent from manifest: ${assetId}`));
    }
  }
  const unavailable = new Map(definition.unavailableRoleGroups.map((entry) => [entry.group, entry.reason]));
  if (unavailable.size !== definition.unavailableRoleGroups.length) {
    errors.push(finding('missing_tileset_variant', 'unavailableRoleGroups', 'role-group unavailability is declared more than once'));
  }
  for (const [group, reason] of unavailable) {
    if (reason.trim().length === 0) {
      errors.push(finding('missing_tileset_variant', `unavailableRoleGroups.${group}`, 'missing group requires a reason'));
    }
  }
  for (const [group, requiredRoles] of Object.entries(TILESET_REQUIRED_ROLES) as [TilesetRoleGroup, readonly string[]][]) {
    const actual = definition.roleFrames.filter((frame) => frame.group === group).map(({ role }) => role);
    const unique = new Set(actual);
    if (actual.length !== unique.size) {
      errors.push(finding('missing_tileset_variant', `roleFrames.${group}`, `${group} contains duplicate roles`));
    }
    const missing = requiredRoles.filter((role) => !unique.has(role));
    const extra = [...unique].filter((role) => !requiredRoles.includes(role));
    if (group === 'edge' || actual.length > 0) {
      if (missing.length > 0 || extra.length > 0 || unavailable.has(group as Exclude<TilesetRoleGroup, 'edge'>)) {
        errors.push(finding(
          'missing_tileset_variant',
          `roleFrames.${group}`,
          `role group must be complete; missing [${missing.join(',')}], extra [${extra.join(',')}]`,
        ));
      }
    } else if (!unavailable.has(group as Exclude<TilesetRoleGroup, 'edge'>)) {
      errors.push(finding('missing_tileset_variant', `unavailableRoleGroups.${group}`, 'missing group requires an explicit reason'));
    }
  }
  if (!definition.faceProfiles.some(({ id }) => id === 'tall')) {
    errors.push(finding('missing_tileset_variant', 'faceProfiles', 'tileset requires a tall face profile'));
  }
  for (const kind of ['ramp', 'stair', 'ladder'] as const) {
    errors.push(...validateTransition(kind, definition.transitions[kind]));
  }
  return Object.freeze(errors);
}
