import type { TerrainArray } from '@orchard/engine/terrain';

interface ProtocolPainterWitness {
  begin(terrain: TerrainArray, context: CanvasRenderingContext2D, scale: number): void;
  enqueue(worldX: number, projectedFootY: number, tie: string | number): void;
}
/** Optional capture observer. The normal painter pays only the null check. */
export let protocolPainterWitness: ProtocolPainterWitness | null = null;
export function observeProtocolPainter(witness: ProtocolPainterWitness): () => void {
  if (protocolPainterWitness !== null) throw new Error('render_protocol_painter_already_observed');
  protocolPainterWitness = witness;
  return () => { if (protocolPainterWitness === witness) protocolPainterWitness = null; };
}
