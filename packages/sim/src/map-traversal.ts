import { resolvedMapCellAt, TERRAIN_MATERIAL_DEFINITIONS } from './map-document.js';
import { RULE_MEDIA, type RuleMedium } from './rule-catalogue.js';
import { terrainDocumentForMapV3, resolvedMapBiomeAt, type MapDocumentV3 } from './map-document-v3.js';
import type { CompiledMapDocument } from './map-compiler.js';
import { terrainCellMedium } from './traversal-medium.js';
import type { CollisionMap } from './state.js';
import type { MediumCollisionChannels } from './traversal.js';

export interface ResolvedTraversalRole {
  readonly medium?: RuleMedium;
  readonly blocksMovement?: boolean;
}
/** Shared semantic projection; visual overlays must not supply this callback.
 * Force-walk/block remain authored geometry, independent of actor abilities. */
export function mapTraversalChannels(
  document: MapDocumentV3,
  compiled: CompiledMapDocument,
  resolvedBaseRoleAt?: (x: number, y: number) => ResolvedTraversalRole | undefined,
): MediumCollisionChannels {
  if (document.width !== compiled.width || document.height !== compiled.height) throw new RangeError('traversal_map_size_mismatch');
  const medium = new Uint8Array(compiled.width * compiled.height);
  const solidBlocked = new Uint8Array(medium.length);
  for (let index = 0; index < medium.length; index++) {
    const x = index % compiled.width, y = Math.floor(index / compiled.width);
    const cell = document.cells[`${x},${y}`];
    const role = resolvedBaseRoleAt?.(x, y);
    const fallback = terrainCellMedium({ biome: resolvedMapBiomeAt(document, x, y),
      surface: compiled.surfaces[index]!, feature: compiled.features[index]! });
    const resolved = role?.medium ?? fallback;
    medium[index] = RULE_MEDIA.indexOf(resolved);
    solidBlocked[index] = Number(cell?.collision === 'force_block'
      || (cell?.collision !== 'force_walk' && (role?.blocksMovement
        ?? (cell?.ledge === true || (fallback === 'land' && compiled.blocked[index] === true)))));
  }
  return { width: compiled.width, height: compiled.height, medium, solidBlocked };
}

/** Static spaces already separate their enclosing geometry from media; hazards
 * are the only explicitly named old flat restrictions removed here. */
export function staticTraversalChannels(ground: CollisionMap, mediumAt: (index: number) => RuleMedium = () => 'land', hazardIndices: ReadonlySet<number> = new Set()): MediumCollisionChannels {
  return { width: ground.width, height: ground.height,
    medium: Uint8Array.from({ length: ground.width * ground.height }, (_, index) => RULE_MEDIA.indexOf(mediumAt(index))),
    solidBlocked: Uint8Array.from(ground.blocked, (blocked, index) => Number(blocked && !hazardIndices.has(index))),
  };
}

/** Media-only projection for generated runtime fast paths; avoids compiling
 * render arrays, elevations and tileset frames just to classify admission. */
export function mapDocumentTraversalChannels(document: MapDocumentV3): MediumCollisionChannels {
  const terrain = terrainDocumentForMapV3(document);
  const medium = new Uint8Array(document.width * document.height);
  const solidBlocked = new Uint8Array(medium.length);
  for (let index = 0; index < medium.length; index++) {
    const x = index % document.width, y = Math.floor(index / document.width);
    const cell = resolvedMapCellAt(terrain, x, y);
    const value = terrainCellMedium({ biome: resolvedMapBiomeAt(document, x, y), surface: cell.surface, feature: cell.feature });
    medium[index] = RULE_MEDIA.indexOf(value);
    const authored = document.cells[`${x},${y}`];
    const legacyBlocked = cell.collision === 'force_block' || (cell.collision !== 'force_walk'
      && (cell.ledge || !TERRAIN_MATERIAL_DEFINITIONS[cell.surface].walkable || cell.feature === 'river'));
    solidBlocked[index] = Number(authored?.collision === 'force_block' || (authored?.collision !== 'force_walk'
      && (authored?.ledge === true || (value === 'land' && legacyBlocked))));
  }
  return { width: document.width, height: document.height, medium, solidBlocked };
}
