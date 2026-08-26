import type { LoadedAsset } from '../render/assets.js';
import type { UiPoint, UiRect } from './geometry.js';
import { uiAssetFrame, type UiSkin } from './skin.js';

export const PLAYER_RESOURCE_FRAME_WIDTH = 48;
export const PLAYER_RESOURCE_FRAME_HEIGHT = 19;

export type PlayerResourceKind = 'health' | 'mana' | 'vigour';

export interface PlayerResourceValues {
  readonly health: number;
  readonly maxHealth: number;
  readonly mana?: number;
  readonly maxMana?: number;
  readonly vigour?: number;
  readonly maxVigour?: number;
}

export interface PlayerResourceFrameSource {
  readonly resolve: (playerId: string) => PlayerResourceValues | null;
  readonly drawHead: (context: CanvasRenderingContext2D, playerId: string, rect: UiRect) => void;
}

export interface PlayerResourceFrameLayout {
  readonly frame: UiRect;
  readonly portrait: UiRect;
  readonly bars: Readonly<Record<PlayerResourceKind, UiRect>>;
}

export function playerResourceFrameLayout(
  x: number,
  y: number,
  scale = 1,
  mirrored = false,
): PlayerResourceFrameLayout {
  const scaled = (value: number): number => Math.round(value * scale);
  return {
    frame: { x, y, width: scaled(PLAYER_RESOURCE_FRAME_WIDTH), height: scaled(PLAYER_RESOURCE_FRAME_HEIGHT) },
    portrait: {
      x: x + scaled(mirrored ? 33 : 3), y: y + scaled(3),
      width: scaled(12), height: scaled(13),
    },
    bars: {
      health: { x: x + scaled(mirrored ? 0 : 18), y: y + scaled(3), width: scaled(30), height: scaled(5) },
      mana: { x: x + scaled(mirrored ? 0 : 18), y: y + scaled(7), width: scaled(30), height: scaled(5) },
      vigour: { x: x + scaled(mirrored ? 0 : 18), y: y + scaled(11), width: scaled(30), height: scaled(5) },
    },
  };
}

function resourceFraction(current: number, maximum: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.max(0, Math.min(1, current / maximum));
}

export function resourceFillWidth(width: number, current: number | undefined, maximum: number | undefined): number {
  if (current === undefined || maximum === undefined) return 0;
  return Math.round(width * resourceFraction(current, maximum));
}

export function resourceFillRect(
  rect: UiRect,
  current: number | undefined,
  maximum: number | undefined,
  mirrored = false,
): UiRect {
  const width = resourceFillWidth(rect.width, current, maximum);
  return {
    x: mirrored ? rect.x + rect.width - width : rect.x,
    y: rect.y,
    width,
    height: rect.height,
  };
}

export function resourceEndpointRect(
  rect: UiRect,
  current: number | undefined,
  maximum: number | undefined,
  mirrored = false,
  authoredWidth = 30,
): UiRect | null {
  const fill = resourceFillRect(rect, current, maximum, mirrored);
  if (fill.width <= 0) return null;
  const width = Math.max(1, Math.round(rect.width / authoredWidth));
  const full = fill.width >= rect.width;
  return {
    x: mirrored
      ? fill.x + (full ? width : 0)
      : fill.x + fill.width - width - (full ? width : 0),
    y: rect.y + Math.max(1, Math.round(rect.height / 5)),
    width,
    height: Math.max(1, rect.height - Math.max(1, Math.round(rect.height / 5)) * 2),
  };
}

/** Draws a partial authored bar without stretching its pixels. The empty frame
 * remains visible underneath the clipped fill. */
function drawResourceFill(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  rect: UiRect,
  current: number | undefined,
  maximum: number | undefined,
  mirrored = false,
  endpointTop = '#fee761',
  endpointBottom = '#feae34',
): void {
  const source = uiAssetFrame(asset);
  if (source === null) return;
  const fill = resourceFillRect(rect, current, maximum, mirrored);
  if (fill.width <= 0) return;
  context.save();
  context.beginPath();
  context.rect(fill.x, fill.y, fill.width, fill.height);
  context.clip();
  if (mirrored) {
    context.save();
    context.translate(rect.x + rect.width, 0);
    context.scale(-1, 1);
    context.drawImage(
      asset.image,
      source.x, source.y, source.width, source.height,
      0, rect.y, rect.width, rect.height,
    );
    context.restore();
  } else {
    context.drawImage(
      asset.image,
      source.x, source.y, source.width, source.height,
      rect.x, rect.y, rect.width, rect.height,
    );
  }
  const endpoint = resourceEndpointRect(rect, current, maximum, mirrored, source.width);
  if (endpoint !== null) {
    const topHeight = Math.max(1, Math.ceil(endpoint.height * 2 / 3));
    context.fillStyle = endpointTop;
    context.fillRect(endpoint.x, endpoint.y, endpoint.width, topHeight);
    if (topHeight < endpoint.height) {
      context.fillStyle = endpointBottom;
      context.fillRect(
        endpoint.x, endpoint.y + topHeight,
        endpoint.width, endpoint.height - topHeight,
      );
    }
  }
  context.restore();
}

/** Reusable identity-targeted HUD frame. The data source decides where a
 * player's current stats and modular portrait come from. */
export class PlayerResourceFrame {
  constructor(
    private readonly skin: Pick<UiSkin, 'barFrame' | 'barRed' | 'barBlue' | 'barGreen'>,
    private readonly source: PlayerResourceFrameSource,
  ) {}

  draw(
    context: CanvasRenderingContext2D,
    playerId: string,
    x: number,
    y: number,
    vigourDenied = false,
    scale = 1,
    mirrored = false,
  ): boolean {
    const resources = this.source.resolve(playerId);
    if (resources === null) return false;
    const frame = uiAssetFrame(this.skin.barFrame);
    if (frame === null) return false;
    const layout = playerResourceFrameLayout(x, y, scale, mirrored);
    context.imageSmoothingEnabled = false;
    context.save();
    if (mirrored) {
      context.translate(layout.frame.x + layout.frame.width, layout.frame.y);
      context.scale(-1, 1);
      context.drawImage(this.skin.barFrame.image, frame.x, frame.y, frame.width, frame.height,
        0, 0, layout.frame.width, layout.frame.height);
    } else {
      context.drawImage(this.skin.barFrame.image, frame.x, frame.y, frame.width, frame.height,
        layout.frame.x, layout.frame.y, layout.frame.width, layout.frame.height);
    }
    context.restore();
    context.save();
    context.beginPath();
    context.rect(layout.portrait.x, layout.portrait.y, layout.portrait.width, layout.portrait.height);
    context.clip();
    this.source.drawHead(context, playerId, layout.portrait);
    context.restore();
    drawResourceFill(
      context, this.skin.barRed, layout.bars.health,
      resources.health, resources.maxHealth, mirrored,
    );
    drawResourceFill(
      context, this.skin.barBlue, layout.bars.mana,
      resources.mana, resources.maxMana, mirrored, '#2ce8f5', '#0095e9',
    );
    drawResourceFill(
      context, this.skin.barGreen, layout.bars.vigour,
      resources.vigour, resources.maxVigour, mirrored, '#fee761', '#63c74d',
    );
    if (vigourDenied && resources.vigour !== undefined) this.drawDeniedCorners(context, layout.bars.vigour);
    return true;
  }

  resourceAtPoint(x: number, y: number, point: UiPoint, scale = 1, mirrored = false): PlayerResourceKind | null {
    const bars = playerResourceFrameLayout(x, y, scale, mirrored).bars;
    for (const kind of ['health', 'mana', 'vigour'] as const) {
      const rect = bars[kind];
      if (point.x >= rect.x && point.x < rect.x + rect.width
        && point.y >= rect.y && point.y < rect.y + rect.height) return kind;
    }
    return null;
  }

  private drawDeniedCorners(context: CanvasRenderingContext2D, rect: UiRect): void {
    context.fillStyle = '#d44747';
    context.fillRect(rect.x, rect.y, 3, 1); context.fillRect(rect.x, rect.y, 1, 3);
    context.fillRect(rect.x + rect.width - 3, rect.y, 3, 1);
    context.fillRect(rect.x + rect.width - 1, rect.y, 1, 3);
    context.fillRect(rect.x, rect.y + rect.height - 1, 3, 1);
    context.fillRect(rect.x, rect.y + rect.height - 3, 1, 3);
    context.fillRect(rect.x + rect.width - 3, rect.y + rect.height - 1, 3, 1);
    context.fillRect(rect.x + rect.width - 1, rect.y + rect.height - 3, 1, 3);
  }
}
