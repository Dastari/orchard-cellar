/** Expansion of authored landmark decoration rules into decorations.
 *
 * Generator-free leaf (static-world S6a): this module must not import the
 * island generator (`survival-world.ts`), `procedural-terrain`, the map
 * compiler, `map-document-v3` or the sim barrel, so chunk-native clients can
 * use it without shipping the generator. `survival-world.ts` re-exports every
 * public name here, so existing imports keep working and resolve to this one
 * module instance. `generator-free-leaves.test.ts` enforces the boundary. */
import type { LandmarkDecorationLayer, LandmarkDecorationRole, SpaceLandmarkDefinition } from './content/world-definition.js';

export interface GeneratedSurvivalDecoration {
  readonly id: number;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly variant: number;
  readonly animationOffset: number;
  readonly role?: LandmarkDecorationRole;
}

export interface SurvivalAuthoredLandmarkDecoration extends GeneratedSurvivalDecoration {
  readonly groupId: string;
  readonly groupLabel: string;
  readonly layer?: LandmarkDecorationLayer;
}

/** Expands compact editor-authored rules while retaining deterministic ids,
 * row ordering, fence joins and animation phasing. These mechanics are engine
 * algorithms; every identity, coordinate and decoration kind is content. */
export function generateSurvivalLandmarkDecorations(
  landmarks: readonly SpaceLandmarkDefinition[],
): readonly SurvivalAuthoredLandmarkDecoration[] {
  const output: SurvivalAuthoredLandmarkDecoration[] = [];
  for (const landmark of landmarks) {
    const base = Number(landmark.runtimeIdBase);
    let nextOffset = 0;
    const add = (
      kind: string, tileX: number, tileY: number, variant = 0, animationOffset = 0,
      explicitOffset?: number, layer?: LandmarkDecorationLayer, role?: LandmarkDecorationRole,
    ): void => {
      const offset = explicitOffset ?? nextOffset;
      output.push({
        id: base + offset,
        kind,
        tileX, tileY, variant, animationOffset,
        groupId: landmark.id,
        groupLabel: landmark.label,
        ...(layer === undefined ? {} : { layer }),
        ...(role === undefined ? {} : { role }),
      });
      nextOffset = offset + 1;
    };
    for (const rule of landmark.decorations) {
      if (rule.kind === 'point') {
        add(rule.decorationKind, rule.tileX, rule.tileY, rule.variant ?? 0,
          rule.animationOffset ?? 0, rule.idOffset, rule.layer, rule.role);
      } else if (rule.kind === 'fill_rectangle') {
        for (let offsetY = 0; offsetY < rule.height; offsetY += 1) {
          for (let offsetX = 0; offsetX < rule.width; offsetX += 1) {
            add(rule.decorationKind, rule.startTileX + offsetX, rule.startTileY + offsetY,
              rule.variant ?? 0,
              offsetX * (rule.animationOffsetX ?? 0) + offsetY * (rule.animationOffsetY ?? 0), undefined, rule.layer,
              rule.role);
          }
        }
      } else {
        const fenceTiles = new Set<string>();
        const fenceAt = (tileX: number, tileY: number): void => {
          fenceTiles.add(`${tileX},${tileY}`);
        };
        for (let tileX = rule.bounds.minimumTileX; tileX <= rule.bounds.maximumTileX; tileX += 1) {
          fenceAt(tileX, rule.bounds.minimumTileY);
          if (tileX !== rule.gateTileX) fenceAt(tileX, rule.bounds.maximumTileY);
        }
        for (let tileY = rule.bounds.minimumTileY + 1; tileY < rule.bounds.maximumTileY; tileY += 1) {
          fenceAt(rule.bounds.minimumTileX, tileY);
          fenceAt(rule.bounds.maximumTileX, tileY);
        }
        for (const key of fenceTiles) {
          const [tileXText, tileYText] = key.split(',');
          const tileX = Number(tileXText);
          const tileY = Number(tileYText);
          const connects = (x: number, y: number): boolean => fenceTiles.has(`${x},${y}`)
            || (x === rule.gateTileX && y === rule.gateTileY);
          const joinMask = (connects(tileX, tileY - 1) ? 1 : 0)
            | (connects(tileX + 1, tileY) ? 2 : 0)
            | (connects(tileX, tileY + 1) ? 4 : 0)
            | (connects(tileX - 1, tileY) ? 8 : 0);
          add(rule.decorationKind, tileX, tileY, joinMask, 0, undefined, rule.layer, rule.role);
        }
        add(rule.gateKind, rule.gateTileX, rule.gateTileY, 8 | 2, 0, undefined, rule.layer, rule.role);
      }
    }
  }
  return Object.freeze(output);
}
