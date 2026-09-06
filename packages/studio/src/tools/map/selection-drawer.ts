import type { MapSelectionInspection } from './selection-inspection.js';

export interface MapSelectionDrawerRow {
  readonly id: string;
  readonly label: string;
}

function token(value: string): string {
  return value.replaceAll('_', ' ').toUpperCase();
}

/** Compact, scrollable rows for the canvas-native map inspector. The labels
 * retain exact source, semantic, asset, and frame identifiers so ellipsis is
 * only a presentation concern rather than data loss in the retained model. */
export function mapSelectionDrawerRows(
  inspection: MapSelectionInspection,
): readonly MapSelectionDrawerRow[] {
  const rows: MapSelectionDrawerRow[] = [
    { id: 'provenance', label: `SOURCE  ${token(inspection.provenance.kind)} · ${inspection.provenance.source}` },
    { id: 'layer', label: `LAYER  ${token(inspection.layer.label)} · ${inspection.layer.active ? 'ACTIVE' : 'INACTIVE'} · ${inspection.layer.visible ? 'VISIBLE' : 'HIDDEN'} · ${inspection.layer.editable ? 'EDITABLE' : 'LOCKED'}` },
    { id: 'position', label: `TILE  ${inspection.tileX}, ${inspection.tileY} · ELEV ${inspection.terrain.cell.elevation}` },
    { id: 'material', label: `BIOME  ${token(inspection.terrain.biome)} [${token(inspection.terrain.sources.biome)}] · SURFACE ${token(inspection.terrain.cell.surface)} [${token(inspection.terrain.sources.surface)}]` },
    { id: 'terrain-family', label: `FAMILY  ${token(inspection.terrain.cell.surfaceFamily)} · CLIFF ${token(inspection.terrain.cell.cliffFamily)}` },
    { id: 'terrain-override', label: `EXACT  ${inspection.terrain.cell.terrainOverride === null ? 'INHERIT' : `${token(inspection.terrain.cell.terrainOverride.family ?? inspection.terrain.cell.cliffFamily)} #${inspection.terrain.cell.terrainOverride.frameIndex ?? 'ROLE'}`} · LEDGE ${inspection.terrain.cell.ledge ? 'YES' : 'NO'}` },
    { id: 'collision', label: `COLLISION  ${inspection.terrain.blocked ? 'BLOCKED' : 'OPEN'} · ${token(inspection.terrain.cell.collision)} [${token(inspection.terrain.sources.collision)}] · PLANE ${token(inspection.terrain.planeCollision)}` },
  ];
  if (inspection.terrain.cell.collisionReason !== null) rows.push({
    id: 'collision-reason', label: `COLLISION WHY  ${inspection.terrain.cell.collisionReason}`,
  });
  if (inspection.entity !== null) {
    const noun = inspection.entity.kind === 'authored_anchor' ? 'ANCHOR' : 'OBJECT';
    const visibility = inspection.entity.kind === 'authored_anchor'
      ? '' : ` · ${inspection.entity.enabled ? 'VISIBLE' : 'HIDDEN'}`;
    rows.push(
      { id: 'object', label: `${noun}  ${inspection.entity.name} · ${token(inspection.entity.kind)}${visibility}` },
      { id: 'object-id', label: `ID  ${inspection.entity.id}` },
      { id: 'object-access', label: `ACCESS  ${inspection.entity.readOnly ? 'READ ONLY' : 'EDITABLE'}${inspection.entity.runtimeKind === null ? '' : ` · TYPE ${token(inspection.entity.runtimeKind)}`}` },
    );
    if (inspection.entity.prefabId !== null) rows.push({
      id: 'prefab', label: `PREFAB  ${inspection.entity.prefabId} · REV ${inspection.entity.prefabRevision ?? 0}`,
    });
    inspection.entity.details.forEach((detail, index) => rows.push({
      id: `live-detail-${index}`,
      label: `${token(detail.label)}  ${detail.value}`,
    }));
    if (inspection.entity.kind !== 'authored_anchor') rows.push({
        id: 'transform',
        label: `TRANSFORM  ${inspection.entity.quarterTurns * 90}° · FLIP ${inspection.entity.flipX ? 'YES' : 'NO'} · SCALE ${inspection.entity.scale}× · ELEV ${inspection.entity.elevation}`,
      });
  }
  inspection.semanticHierarchy.forEach((layer, index) => rows.push({
    id: `why-${index}`,
    label: `WHY ${index + 1}  ${layer.hierarchy.map(token).join(' › ')} · ${layer.reason} · ${layer.family}${layer.frameIndex === null ? '' : ` #${layer.frameIndex}`}`,
  }));
  inspection.visualComposition.layers.forEach((layer, index) => rows.push({
    id: `visual-${index}`,
    label: `DRAW ${index + 1}  ${token(layer.role)} · ${layer.asset}${layer.frame === null ? '' : ` #${layer.frame}`} · L${layer.contourLevel}`,
  }));
  if (inspection.suppression.supported) rows.push({
    id: 'suppression',
    label: `SUPPRESSION  ${inspection.suppression.id ?? 'UNAVAILABLE'} · ${inspection.suppression.suppressed ? 'SUPPRESSED' : 'GENERATED'}`,
  });
  return Object.freeze(rows);
}
