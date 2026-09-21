import {
  bootstrapTilesetDefinitions,
  compileMapDocument,
  exactTerrainOverrideFramesForRole,
  mapCoordinateInBounds,
  RESERVED_TILESET_FAMILIES,
  runtimeTilesetResolver,
  semanticTerrainTraceAt,
  TERRAIN_SURFACE_FAMILIES,
  TERRAIN_SURFACE_FAMILY_IDS,
  validateExactTerrainOverride,
  type MapDocumentV2,
  type RaisedTerrainRole,
  type RuntimeTilesetResolver,
  type SemanticTerrainLayer,
  type TerrainOverride,
  type TerrainSurfaceFamilyId,
  type TilesetContentDefinition,
} from '@orchard/sim';

export const MAP_TERRAIN_AUTHORING_MODES = [
  'brush', 'surface_family', 'cliff_family', 'exact_override', 'farmland_visual',
] as const;
export type MapTerrainAuthoringMode = typeof MAP_TERRAIN_AUTHORING_MODES[number];

export interface TerrainPalettePreview {
  readonly assetId: string;
  readonly frameIndex: number;
}

export interface TerrainSurfaceFamilyChoice {
  readonly familyId: TerrainSurfaceFamilyId;
  readonly label: string;
  readonly preview: TerrainPalettePreview;
  readonly sheetAssetId: string;
}

export interface TerrainCliffFamilyChoice {
  readonly familyId: string;
  readonly definitionId: string;
  readonly label: string;
  readonly projectionStyle: 'raised' | 'interior';
  readonly preview: TerrainPalettePreview;
}

export interface TerrainCliffFamilyExclusion {
  readonly familyId: string;
  readonly reason: string;
}

export interface TerrainFarmlandVisualChoice {
  readonly id: 'dry_farmland_visual';
  readonly label: 'Farmland · Visual';
  readonly warning: string;
  readonly preview: TerrainPalettePreview;
}

export interface ExactTerrainOverrideChoice {
  readonly id: string;
  readonly label: string;
  readonly familyId: string;
  readonly definitionId: string;
  readonly contourLevel: number;
  readonly semanticRole: SemanticTerrainLayer['role'];
  readonly role: RaisedTerrainRole;
  readonly frameIndex: number;
  readonly assetId: string;
  readonly override: TerrainOverride;
}

export interface ExactTerrainOverrideChoiceRequest {
  readonly document: MapDocumentV2;
  readonly tileX: number;
  readonly tileY: number;
  readonly query?: string;
  readonly familyId?: string;
  readonly palette?: TerrainAuthoringPalette;
}

export interface TerrainAuthoringPalette {
  readonly contentKey: string;
  readonly mode: 'offline' | 'live';
  readonly definitions: readonly TilesetContentDefinition[];
  readonly resolver: RuntimeTilesetResolver;
}

const BOOTSTRAP_TILESET_DEFINITIONS = bootstrapTilesetDefinitions();

function strictResolver(definitions: readonly TilesetContentDefinition[]): RuntimeTilesetResolver {
  const active = definitions.filter((definition) => definition.retired !== true);
  const activeFamilies = new Set(active.map(({ familyId }) => familyId));
  const resolver = runtimeTilesetResolver(active);
  return Object.freeze({
    familyIds: Object.freeze([...activeFamilies].sort((left, right) => left.localeCompare(right))),
    tileSetFor: (familyId: string) => activeFamilies.has(familyId)
      ? resolver.tileSetFor(familyId) : null,
  });
}

export function liveTerrainAuthoringPalette(
  definitions: readonly TilesetContentDefinition[],
  contentKey: string,
): TerrainAuthoringPalette {
  const active = Object.freeze(definitions
    .filter((definition) => definition.retired !== true)
    .sort((left, right) => left.id.localeCompare(right.id)));
  return Object.freeze({
    contentKey: `live:${contentKey}`,
    mode: 'live',
    definitions: active,
    resolver: strictResolver(active),
  });
}

export const OFFLINE_TERRAIN_AUTHORING_PALETTE: TerrainAuthoringPalette = Object.freeze({
  contentKey: 'offline:bootstrap',
  mode: 'offline',
  definitions: BOOTSTRAP_TILESET_DEFINITIONS,
  resolver: strictResolver(BOOTSTRAP_TILESET_DEFINITIONS),
});
const DRY_FARMLAND_VISUAL: TerrainFarmlandVisualChoice = Object.freeze({
  id: 'dry_farmland_visual',
  label: 'Farmland · Visual',
  warning: 'Dry appearance only; wet soil and crops remain runtime authority',
  preview: Object.freeze({ assetId: 'tile_cf_farmland', frameIndex: 0 }),
});

function labelForId(id: string): string {
  return id.split('_').map((part) => `${part.slice(0, 1).toLocaleUpperCase()}${part.slice(1)}`).join(' ');
}

function matchesSearch(search: string | undefined, values: readonly (string | number)[]): boolean {
  const terms = search?.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean) ?? [];
  if (terms.length === 0) return true;
  const searchable = values.join(' ').toLocaleLowerCase();
  return terms.every((term) => searchable.includes(term));
}

/** Registered grass fills with their actual opaque preview asset. */
export function terrainSurfaceFamilyChoices(
  search = '',
  palette: TerrainAuthoringPalette = OFFLINE_TERRAIN_AUTHORING_PALETTE,
): readonly TerrainSurfaceFamilyChoice[] {
  const authoredIds = palette.mode === 'offline'
    ? TERRAIN_SURFACE_FAMILY_IDS
    : TERRAIN_SURFACE_FAMILY_IDS.filter((familyId) => palette.definitions
      .some((definition) => definition.surfaceFamily === familyId));
  return authoredIds.map((familyId) => {
    const family = TERRAIN_SURFACE_FAMILIES[familyId];
    return {
      familyId,
      label: labelForId(familyId),
      preview: { assetId: family.assetId, frameIndex: 0 },
      sheetAssetId: family.sheetAssetId,
    };
  }).filter((choice) => matchesSearch(search, [
    choice.familyId, choice.label, choice.preview.assetId, choice.sheetAssetId,
  ]));
}

function cliffPreview(definition: TilesetContentDefinition): TerrainPalettePreview {
  const preferred = definition.roleFrames.find((entry) => entry.group === 'edge' && entry.role === 'top')
    ?? definition.roleFrames.find((entry) => entry.group === 'edge')
    ?? definition.roleFrames[0];
  if (preferred !== undefined) return { assetId: preferred.assetId, frameIndex: preferred.frame };
  const face = definition.faceProfiles.find((profile) => profile.id === 'tall')?.rows[0]
    ?? definition.faceProfiles[0]?.rows[0];
  if (face !== undefined) return { assetId: face.assetId, frameIndex: face.frames[1] };
  throw new TypeError(`Tileset ${definition.id} has no previewable authored frame`);
}

export function terrainCliffFamilyChoices(
  search = '',
  palette: TerrainAuthoringPalette = OFFLINE_TERRAIN_AUTHORING_PALETTE,
): readonly TerrainCliffFamilyChoice[] {
  return palette.definitions.flatMap((definition): readonly TerrainCliffFamilyChoice[] => {
    let preview: TerrainPalettePreview;
    try { preview = cliffPreview(definition); }
    catch { return []; }
    return [{
      familyId: definition.familyId,
      definitionId: definition.id,
      label: labelForId(definition.familyId),
      projectionStyle: definition.projectionStyle,
      preview,
    }];
  }).filter((choice) => matchesSearch(search, [
    choice.familyId, choice.definitionId, choice.label,
    choice.projectionStyle, choice.preview.assetId,
  ]));
}

/** Reserved families stay visible to explanatory UI without becoming choices.
 * Snow is intentionally here: the checked Christmas pack has overlays but no
 * reproducible cliff source sheet. */
export function terrainCliffFamilyExclusions(
  palette: TerrainAuthoringPalette = OFFLINE_TERRAIN_AUTHORING_PALETTE,
): readonly TerrainCliffFamilyExclusion[] {
  return palette.mode === 'offline'
    ? RESERVED_TILESET_FAMILIES.map(({ familyId, reason }) => ({ familyId, reason }))
    : [];
}

/** Authored farmland is intentionally one dry visual. Runtime wetness, crop
 * occupancy, and growth stay outside the map document. */
export function terrainFarmlandVisualChoices(search = ''): readonly TerrainFarmlandVisualChoice[] {
  return matchesSearch(search, [
    DRY_FARMLAND_VISUAL.id,
    DRY_FARMLAND_VISUAL.label,
    DRY_FARMLAND_VISUAL.warning,
    DRY_FARMLAND_VISUAL.preview.assetId,
  ]) ? [DRY_FARMLAND_VISUAL] : [];
}

function overrideRoleForSemanticLayer(
  semanticRole: SemanticTerrainLayer['role'],
): RaisedTerrainRole | null {
  if (semanticRole.startsWith('contour.edge.')) {
    return semanticRole.slice('contour.edge.'.length) as RaisedTerrainRole;
  }
  if (semanticRole.startsWith('contour.inset.')) {
    return semanticRole.slice('contour.inset.'.length) as RaisedTerrainRole;
  }
  if (semanticRole.startsWith('contour.face.')) {
    return semanticRole.slice('contour.'.length) as RaisedTerrainRole;
  }
  if (semanticRole.startsWith('crossing.ramp_')) {
    return semanticRole.slice('crossing.'.length) as RaisedTerrainRole;
  }
  return null;
}

function assetForExactFrame(
  definition: TilesetContentDefinition,
  role: RaisedTerrainRole,
  frameIndex: number,
): string | null {
  if (role.startsWith('face.')) {
    const [, rowId, join] = role.split('.');
    if (rowId === undefined || (join !== 'left' && join !== 'middle' && join !== 'right')) return null;
    const profile = definition.faceProfiles.find(({ id }) => id === 'tall');
    const row = [...(profile?.rows ?? []), ...(profile?.repeatRows ?? [])].find((candidate) => (
      candidate.id === rowId
      && ((join === 'left' ? candidate.frames[0]
        : join === 'middle' ? candidate.frames[1] : candidate.frames[2]) === frameIndex
        || (join === 'middle' && candidate.middleVariants?.includes(frameIndex) === true))
    ));
    return row?.assetId ?? null;
  }
  if (role.startsWith('ramp_')) {
    const ramp = definition.transitions.ramp;
    return ramp.available ? ramp.assetId : null;
  }
  const group = role.startsWith('inner_') ? 'inset' : 'edge';
  return definition.roleFrames.find((entry) => (
    entry.group === group && entry.role === role && entry.frame === frameIndex
  ))?.assetId ?? null;
}

/** Exact substitutions compatible with the selected cell's unmodified
 * topology. Flat/surface-only cells deliberately offer no arbitrary frames. */
export function exactTerrainOverrideChoicesAt(
  request: ExactTerrainOverrideChoiceRequest,
): readonly ExactTerrainOverrideChoice[] {
  const { document, tileX, tileY, query, familyId,
    palette = OFFLINE_TERRAIN_AUTHORING_PALETTE } = request;
  if (!mapCoordinateInBounds(document, tileX, tileY)) return [];
  const compiled = compileMapDocument(document, palette.resolver);
  const trace = semanticTerrainTraceAt(document, tileX, tileY, compiled, false);
  const candidates: ExactTerrainOverrideChoice[] = [];
  const ids = new Set<string>();
  for (const layer of trace.layers) {
    const role = overrideRoleForSemanticLayer(layer.role);
    if (role === null) continue;
    for (const definition of palette.definitions) {
      if (familyId !== undefined && definition.familyId !== familyId) continue;
      const tileSet = palette.resolver.tileSetFor(definition.familyId);
      if (tileSet === null) continue;
      const frames = exactTerrainOverrideFramesForRole(tileSet, role) ?? [];
      for (const frameIndex of frames) {
        const assetId = assetForExactFrame(definition, role, frameIndex);
        if (assetId === null) continue;
        const override: TerrainOverride = {
          contourLevel: layer.contourLevel,
          role,
          family: definition.familyId,
          frameIndex,
        };
        if (validateExactTerrainOverride(override, definition.familyId, tileSet, role).length > 0) continue;
        const id = `${layer.contourLevel}:${role}:${definition.familyId}:${frameIndex}`;
        if (ids.has(id)) continue;
        const label = `${labelForId(definition.familyId)} · ${role.replaceAll('_', ' ')} · ${frameIndex}`;
        const choice: ExactTerrainOverrideChoice = {
          id,
          label,
          familyId: definition.familyId,
          definitionId: definition.id,
          contourLevel: layer.contourLevel,
          semanticRole: layer.role,
          role,
          frameIndex,
          assetId,
          override,
        };
        if (matchesSearch(query, [
          label, definition.familyId, definition.id, layer.contourLevel,
          layer.role, role, frameIndex, assetId,
        ])) {
          ids.add(id);
          candidates.push(choice);
        }
      }
    }
  }
  return candidates;
}
