import { beginPainterItem, endPainterItem } from '@orchard/engine/painter-context';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import type { WorldItemIdentity } from '@orchard/engine/painter-depth';
import type { UnifiedLightReceiver } from '@orchard/engine/lighting';
import type { GameplayPainterInput } from './gameplay-painter.js';

/** A retained producer item owns one stable projection/receiver draw wrapper.
 * Its current frame data is overwritten before submission, never captured in
 * a frame-local closure. The same source submitted twice still gets two items. */
export class GameplayPainterCommand implements WorldDepthItem {
  footY = 0;
  depthOffset = 0;
  elevationLayer = 0;
  readonly depthPhase = 'entity' as const;
  tie: string | number;
  debugTie?: string;
  sortIdentity?: WorldItemIdentity;
  seen = -1;
  projection = 0;
  worldX = 0;
  terrainSampleY = 0;
  receiver: UnifiedLightReceiver = 'south';
  constructor(readonly source: WorldDepthItem, public input: GameplayPainterInput) {
    this.tie = source.tie; this.debugTie = source.debugTie;
  }
  readonly draw = (): void => {
    const { context, scale, drawWorldReceiver } = this.input;
    const nested = beginPainterItem(context);
    try {
      context.translate(0, -this.projection * scale);
      drawWorldReceiver(this.worldX, this.terrainSampleY, this.source.draw, this.receiver);
    } finally { endPainterItem(context, nested); }
  };
}
