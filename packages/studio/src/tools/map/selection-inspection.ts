import {
  SURVIVAL_BIOMES,
  compileMapDocument,
  mapCellKey,
  resolvedMapBiomeAt,
  resolvedMapCellAt,
  semanticTerrainTraceAt,
  terrainDocumentForMapV3,
  type CompiledMapDocument,
  type MapBiomeId,
  type MapContentLayerDefinition,
  type MapContentLayerId,
  type MapDocumentV3,
  type MapGameplayAnchor,
  type MapLandmarkInstance,
  type MapObjectInstance,
  type MapProvenance,
  type ResolvedMapCell,
  type SemanticTerrainTrace,
  type MapSurfaceKind,
} from '@orchard/sim';
import {
  inspectTerrainAtProjectedPoint,
  terrainArrayForMapDocument,
  terrainMaximumElevation,
  terrainMinimumElevation,
  terrainPlaneCollisionCellAt,
  terrainProjectedDepthForElevation,
  type TerrainArray,
  type TerrainInspection,
} from '@orchard/engine';
import type { StudioSelection } from '../../shell/index.js';
import { mapEditorCanReuseGeneratedTerrain } from './editor-terrain-build.js';

export type MapInspectionValueSource = MapProvenance['kind'] | 'live';

export interface MapGeneratedSelectionDescriptor {
  readonly entityKind: string;
  readonly id: string;
  readonly spaceId: number;
  readonly name: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly layer: MapContentLayerId;
  readonly source: string;
  /** Omitted for generated-map descriptors retained by older callers. */
  readonly provenance?: 'generated' | 'live';
  readonly runtimeKind?: string;
  readonly movable?: boolean;
  readonly details?: readonly { readonly label: string; readonly value: string }[];
  /** Canonical persisted suppression key, such as `resource-42` or
   * `decoration-123`. Null means that generator has no suppression seam. */
  readonly suppressionId: string | null;
}

export interface MapSelectionInspectionInput {
  readonly document: MapDocumentV3;
  readonly selection: StudioSelection;
  readonly activeLayer: MapContentLayerId;
  readonly hiddenLayers?: readonly MapContentLayerId[];
  readonly generatedEntities?: readonly MapGeneratedSelectionDescriptor[];
  /** Callers drawing every frame should pass their terrain-identity caches. */
  readonly compiled?: CompiledMapDocument;
  readonly terrain?: TerrainArray;
}

export interface MapInspectionProvenance {
  readonly kind: MapInspectionValueSource;
  readonly source: string;
  readonly authored: boolean;
  readonly generated: boolean;
}

export interface MapInspectionLayer {
  readonly id: MapContentLayerId;
  readonly label: string;
  readonly editable: boolean;
  readonly active: boolean;
  readonly visible: boolean;
}

export interface MapInspectionTerrainSources {
  readonly biome: MapInspectionValueSource;
  readonly surface: MapInspectionValueSource;
  readonly elevation: MapInspectionValueSource;
  readonly collision: MapInspectionValueSource;
  readonly visualOverride: MapInspectionValueSource;
}

export interface MapInspectionSemanticLayer {
  readonly role: string;
  /** Root-to-leaf role hierarchy, for example `['contour', 'edge', 'north']`. */
  readonly hierarchy: readonly string[];
  readonly contourLevel: number;
  readonly blocksMovement: boolean;
  readonly blocksLight: boolean;
  readonly reason: string;
  readonly family: string;
  readonly frameIndex: number | null;
}

export interface MapInspectionEntity {
  readonly kind: 'authored_object' | 'authored_landmark' | 'authored_anchor' | 'generated_object' | 'live_object';
  readonly id: string;
  readonly name: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly quarterTurns: 0 | 1 | 2 | 3;
  readonly flipX: boolean;
  readonly scale: 1 | 2;
  readonly enabled: boolean;
  readonly prefabId: string | null;
  readonly prefabRevision: number | null;
  readonly runtimeKind: string | null;
  readonly readOnly: boolean;
  readonly details: readonly { readonly label: string; readonly value: string }[];
}

export interface MapSelectionInspection {
  readonly target: 'tile' | 'entity';
  readonly tileX: number;
  readonly tileY: number;
  readonly provenance: MapInspectionProvenance;
  readonly layer: MapInspectionLayer;
  readonly entity: MapInspectionEntity | null;
  readonly terrain: {
    readonly biome: MapBiomeId;
    readonly cell: ResolvedMapCell;
    readonly blocked: boolean;
    readonly planeCollision: TerrainInspection['collisionCell'];
    readonly sources: MapInspectionTerrainSources;
  };
  readonly semanticTrace: SemanticTerrainTrace;
  readonly semanticHierarchy: readonly MapInspectionSemanticLayer[];
  /** Exact back-to-front asset/frame roles exposed by the production terrain
   * inspector. Cached ground pixels deliberately remain `ground_cache`. */
  readonly visualComposition: TerrainInspection;
  readonly suppression: {
    readonly supported: boolean;
    readonly id: string | null;
    readonly suppressed: boolean;
    readonly canSuppress: boolean;
    readonly canRestore: boolean;
  };
}

interface ResolvedTarget {
  readonly target: MapSelectionInspection['target'];
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number | null;
  readonly layer: MapContentLayerId;
  readonly provenance: MapInspectionProvenance;
  readonly entity: MapInspectionEntity | null;
  readonly suppressionId: string | null;
}

function provenance(kind: MapInspectionValueSource, source: string): MapInspectionProvenance {
  return { kind, source, authored: kind === 'authored', generated: kind === 'generated' };
}

function authoredObject(document: MapDocumentV3, object: MapObjectInstance): ResolvedTarget {
  const prefab = document.prefabs.find(({ id, revision }) => (
    id === object.prefabId && revision === object.prefabRevision
  ));
  return {
    target: 'entity', tileX: object.tileX, tileY: object.tileY, elevation: object.elevation,
    layer: object.layer, provenance: provenance('authored', `map-object:${object.id}`),
    suppressionId: null,
    entity: {
      kind: 'authored_object', id: object.id, name: prefab?.title ?? object.prefabId,
      tileX: object.tileX, tileY: object.tileY, elevation: object.elevation,
      quarterTurns: object.quarterTurns, flipX: object.flipX, scale: object.scale ?? 1,
      enabled: object.enabled, prefabId: object.prefabId, prefabRevision: object.prefabRevision,
      runtimeKind: null, readOnly: false, details: [],
    },
  };
}

function authoredLandmark(landmark: MapLandmarkInstance): ResolvedTarget {
  return {
    target: 'entity', tileX: landmark.tileX, tileY: landmark.tileY, elevation: landmark.elevation,
    layer: landmark.layer, provenance: provenance('authored', `map-landmark:${landmark.id}`),
    suppressionId: null,
    entity: {
      kind: 'authored_landmark', id: landmark.id, name: landmark.groupLabel,
      tileX: landmark.tileX, tileY: landmark.tileY, elevation: landmark.elevation,
      quarterTurns: landmark.quarterTurns, flipX: landmark.flipX, scale: landmark.scale ?? 1,
      enabled: landmark.enabled, prefabId: null, prefabRevision: null,
      runtimeKind: landmark.kind, readOnly: false, details: [],
    },
  };
}

function authoredAnchor(anchor: MapGameplayAnchor): ResolvedTarget {
  const editable = anchor.kind === 'poi' || anchor.kind === 'label';
  return {
    target: 'entity', tileX: anchor.tileX, tileY: anchor.tileY, elevation: anchor.elevation,
    layer: 'anchors', provenance: provenance('authored', `map-anchor:${anchor.id}`),
    suppressionId: null,
    entity: {
      kind: 'authored_anchor', id: anchor.id, name: anchor.label ?? anchor.id,
      tileX: anchor.tileX, tileY: anchor.tileY, elevation: anchor.elevation,
      quarterTurns: 0, flipX: false, scale: 1, enabled: true,
      prefabId: null, prefabRevision: null, runtimeKind: anchor.kind, readOnly: !editable,
      details: [
        { label: 'Kind', value: anchor.kind.toUpperCase() },
        ...(anchor.label === undefined ? [] : [{ label: 'Label', value: anchor.label }]),
        { label: 'Runtime', value: 'UNBOUND' },
      ],
    },
  };
}

function generatedObject(generated: MapGeneratedSelectionDescriptor): ResolvedTarget {
  const sourceKind = generated.provenance ?? 'generated';
  return {
    target: 'entity', tileX: generated.tileX, tileY: generated.tileY,
    elevation: generated.elevation, layer: generated.layer,
    provenance: provenance(sourceKind, generated.source),
    suppressionId: generated.suppressionId,
    entity: {
      kind: sourceKind === 'live' ? 'live_object' : 'generated_object',
      id: generated.id, name: generated.name,
      tileX: generated.tileX, tileY: generated.tileY, elevation: generated.elevation,
      quarterTurns: 0, flipX: false, scale: 1, enabled: true,
      prefabId: null, prefabRevision: null,
      runtimeKind: generated.runtimeKind ?? null, readOnly: generated.movable!==true,
      details: generated.details ?? [],
    },
  };
}

function selectedTarget(input: MapSelectionInspectionInput): ResolvedTarget | null {
  const { document, selection } = input;
  if (selection.kind === 'tile') return {
    target: 'tile', tileX: selection.tileX, tileY: selection.tileY, elevation: null,
    layer: 'terrain', provenance: provenance(
      Object.keys(document.cells[mapCellKey(selection.tileX, selection.tileY)] ?? {}).length > 0
        ? 'authored' : document.provenance.kind,
      Object.keys(document.cells[mapCellKey(selection.tileX, selection.tileY)] ?? {}).length > 0
        ? `map-cell:${selection.tileX},${selection.tileY}` : document.provenance.source,
    ), entity: null, suppressionId: null,
  };
  if (selection.kind !== 'entity' && selection.kind !== 'player') return null;
  if (selection.kind === 'player') {
    const generated = input.generatedEntities?.find((candidate) => (
      candidate.entityKind === 'player' && candidate.id === selection.identity
        && (selection.spaceId === null || candidate.spaceId === selection.spaceId)
    ));
    return generated === undefined ? null : generatedObject(generated);
  }
  if (selection.entityKind === 'map-object') {
    const object = document.objects.find(({ id }) => id === selection.id);
    if (object !== undefined) return authoredObject(document, object);
    const landmark = document.landmarks.find(({ id }) => id === selection.id);
    if (landmark !== undefined) return authoredLandmark(landmark);
  }
  if (selection.entityKind === 'map-anchor') {
    const anchor = document.anchors.find(({ id }) => id === selection.id);
    if (anchor !== undefined) return authoredAnchor(anchor);
  }
  const generated = input.generatedEntities?.find((candidate) => (
    candidate.entityKind === selection.entityKind && candidate.id === selection.id
      && candidate.spaceId === selection.spaceId
  ));
  return generated === undefined ? null : generatedObject(generated);
}

function selectedLayer(
  document: MapDocumentV3,
  id: MapContentLayerId,
  activeLayer: MapContentLayerId,
  hiddenLayers: readonly MapContentLayerId[],
  readOnly = false,
): MapInspectionLayer {
  const definition: MapContentLayerDefinition | undefined = document.layers.find((layer) => layer.id === id);
  return {
    id,
    label: definition?.label ?? id.replaceAll('_', ' '),
    editable: !readOnly && (definition?.editable ?? false),
    active: id === activeLayer,
    visible: !hiddenLayers.includes(id),
  };
}

function fieldSource(
  document: MapDocumentV3,
  tileX: number,
  tileY: number,
  property: 'biome' | 'surface' | 'elevation' | 'collision' | 'terrainOverride',
): MapInspectionValueSource {
  return document.cells[mapCellKey(tileX, tileY)]?.[property] === undefined
    ? document.provenance.kind : 'authored';
}

function generatedSurfaceForBiome(biome: MapBiomeId): MapSurfaceKind {
  if (biome === 'water' || biome === 'freshwater' || biome === 'waterfall'
    || biome === 'oasis_water') return 'water';
  if (biome === 'beach' || biome === 'desert_shore') return 'sand';
  if (biome === 'highland' || biome === 'ridge' || biome === 'desert_ridge'
    || biome === 'coastal_cliff') return 'stone';
  if (biome === 'dirt_terrace' || biome === 'dirt_ridge') return 'dirt';
  return 'grass';
}

const compiledFacadeByTerrain = new WeakMap<TerrainArray, CompiledMapDocument>();

/**
 * TerrainArray is already the renderer's compiled derivative of this exact
 * document. Adapt its topology arrays for point inspection instead of
 * compiling every cell again on the pointer event.
 */
function compiledFacadeForTerrain(
  document: MapDocumentV3,
  terrain: TerrainArray,
): CompiledMapDocument {
  const cached = compiledFacadeByTerrain.get(terrain);
  if (cached !== undefined) return cached;
  const defaultCliffFamily = terrain.defaultCliffFamily ?? document.defaultCliffFamily ?? 'stone_1';
  const compiled: CompiledMapDocument = {
    id: document.id,
    width: terrain.width,
    height: terrain.height,
    revision: document.revision,
    baseElevation: document.baseElevation,
    defaultCliffFamily,
    cliffFamilyIds: terrain.cliffFamilyIds ?? [defaultCliffFamily],
    ...(terrain.tilesets === undefined ? {} : { tilesets: terrain.tilesets }),
    elevations: terrain.elevations,
    cliffFamilies: terrain.cliffFamilies ?? new Uint8Array(0),
    surfaceFamilies: terrain.surfaceFamilies ?? new Uint8Array(0),
    terrainOverrides: terrain.terrainOverrides ?? [],
    ...(terrain.cellParts === undefined ? {} : { cellParts: terrain.cellParts }),
    ledges: terrain.ledges ?? new Uint8Array(0),
    surfaces: [],
    features: [],
    blocked: terrain.blocked,
    transitions: terrain.terrainTransitions ?? document.transitions,
  };
  compiledFacadeByTerrain.set(terrain, compiled);
  return compiled;
}

function generatedInspectionContext(
  document: MapDocumentV3,
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): {
  readonly terrainDocument: ReturnType<typeof terrainDocumentForMapV3>;
  readonly compiled: CompiledMapDocument;
  readonly biome: MapBiomeId;
  readonly cell: ResolvedMapCell;
} | null {
  if (!mapEditorCanReuseGeneratedTerrain(document)
    || terrain.width !== document.width || terrain.height !== document.height) return null;
  const index = tileY * terrain.width + tileX;
  const biome = SURVIVAL_BIOMES[terrain.biomes[index] ?? 0] ?? 'water';
  const blocked = terrain.blocked[index] ?? true;
  const terrainDocument = terrainDocumentForMapV3(document);
  const cell: ResolvedMapCell = {
    elevation: terrain.elevations[index] ?? document.baseElevation,
    surface: generatedSurfaceForBiome(biome),
    feature: 'none',
    collision: blocked ? 'force_block' : 'inherit',
    collisionReason: blocked ? `generated ${biome} terrain` : null,
    cliffFamily: document.defaultCliffFamily ?? 'stone_1',
    surfaceFamily: document.defaultSurfaceFamily ?? 'grass_1',
    terrainOverride: null,
    parts: [],
    ledge: false,
  };
  return { terrainDocument, compiled: compiledFacadeForTerrain(document, terrain), biome, cell };
}

export function inspectMapSelection(input: MapSelectionInspectionInput): MapSelectionInspection | null {
  const target = selectedTarget(input);
  if (target === null || target.tileX < 0 || target.tileY < 0
    || target.tileX >= input.document.width || target.tileY >= input.document.height) return null;
  const generatedContext = input.terrain === undefined ? null
    : generatedInspectionContext(input.document, input.terrain, target.tileX, target.tileY);
  const terrainDocument = generatedContext?.terrainDocument ?? terrainDocumentForMapV3(input.document);
  const compiled = input.compiled ?? generatedContext?.compiled ?? (input.terrain === undefined
    ? compileMapDocument(terrainDocument)
    : compiledFacadeForTerrain(input.document, input.terrain));
  const terrain = input.terrain ?? terrainArrayForMapDocument(terrainDocument, compiled, input.document);
  const cell = generatedContext?.cell ?? resolvedMapCellAt(terrainDocument, target.tileX, target.tileY);
  const activeElevation = target.elevation ?? cell.elevation;
  const blocked = compiled.blocked[target.tileY * compiled.width + target.tileX] ?? true;
  const projectedWorldX = target.tileX * 16 + 8;
  const projectedWorldY = target.tileY * 16 + 8
    - terrainProjectedDepthForElevation(terrain, activeElevation);
  const visualComposition = inspectTerrainAtProjectedPoint(
    terrain, projectedWorldX, projectedWorldY, activeElevation, blocked,
  );
  const rawSemanticTrace = semanticTerrainTraceAt(
    terrainDocument, target.tileX, target.tileY, compiled, true,
    input.terrain === undefined ? undefined : {
      minimum: terrainMinimumElevation(terrain),
      maximum: terrainMaximumElevation(terrain),
    },
    cell,
  );
  const semanticTrace: SemanticTerrainTrace = generatedContext === null ? rawSemanticTrace : {
    ...rawSemanticTrace,
    layers: rawSemanticTrace.layers.map((layer, index) => index === 0 ? {
      ...layer,
      reason: `generated ${generatedContext.biome} surface selected by survival-island biome`,
    } : layer),
  };
  const suppressionId = target.suppressionId;
  const suppressed = suppressionId !== null && input.document.generatedSuppressions.includes(suppressionId);
  return {
    target: target.target,
    tileX: target.tileX,
    tileY: target.tileY,
    provenance: target.provenance,
    layer: selectedLayer(
      input.document, target.layer, input.activeLayer, input.hiddenLayers ?? [],
      target.entity?.readOnly === true,
    ),
    entity: target.entity,
    terrain: {
      biome: generatedContext?.biome ?? resolvedMapBiomeAt(input.document, target.tileX, target.tileY),
      cell,
      blocked,
      planeCollision: terrainPlaneCollisionCellAt(terrain, target.tileX, target.tileY, activeElevation),
      sources: {
        biome: fieldSource(input.document, target.tileX, target.tileY, 'biome'),
        surface: fieldSource(input.document, target.tileX, target.tileY, 'surface'),
        elevation: fieldSource(input.document, target.tileX, target.tileY, 'elevation'),
        collision: fieldSource(input.document, target.tileX, target.tileY, 'collision'),
        visualOverride: fieldSource(input.document, target.tileX, target.tileY, 'terrainOverride'),
      },
    },
    semanticTrace,
    semanticHierarchy: semanticTrace.layers.map((layer) => ({
      role: layer.role,
      hierarchy: layer.role.split('.'),
      contourLevel: layer.contourLevel,
      blocksMovement: layer.blocksMovement,
      blocksLight: layer.blocksLight,
      reason: layer.reason,
      family: layer.family,
      frameIndex: layer.frameIndex ?? null,
    })),
    visualComposition,
    suppression: {
      supported: suppressionId !== null,
      id: suppressionId,
      suppressed,
      canSuppress: suppressionId !== null && !suppressed,
      canRestore: suppressionId !== null && suppressed,
    },
  };
}
