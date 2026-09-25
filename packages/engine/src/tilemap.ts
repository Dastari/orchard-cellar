import { farmlandRuleLayers } from '@orchard/sim/terrain-rule-catalogue';
import type { AtlasFrame } from '@orchard/ui';

/** Reusable authored-tile contract retained for future instanced maps. */
export interface TileDefinition {
  readonly fill: string;
  readonly inset?: {
    readonly color: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly atlas?: {
    readonly image: CanvasImageSource;
    readonly frame: AtlasFrame;
    readonly frames?: readonly AtlasFrame[];
    readonly autotile?: 'blob47';
  };
  readonly overlayAtlas?: { readonly image: CanvasImageSource; readonly frame: AtlasFrame };
}

/** Legacy packed-diagonal adapter; the authored table owns frame numbering. */
export function canonicalBlob47Index(cardinals: number, diagonalChoice: number): number {
  const eligible = [[1,2],[2,4],[4,8],[8,1]] as const;
  let mask=cardinals & 15;let bit=0;
  for(let i=0;i<eligible.length;i++){
    const [a,b]=eligible[i]!;
    if((cardinals&a)&&(cardinals&b)){if(diagonalChoice&(1<<bit))mask|=1<<(i+4);bit++;}
  }
  const offsets=[[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]] as const;
  return blob47FrameIndexFor((x,y)=>{const i=offsets.findIndex(([dx,dy])=>x===dx&&y===dy);return i>=0&&(mask&(1<<i))!==0;});
}

export function blob47FrameIndexFor(matches: (offsetX: number, offsetY: number) => boolean): number {
  const frame=farmlandRuleLayers(matches)[0];
  if(!frame)throw new Error('farmland_rule_base_missing');
  return frame.frame;
}

export function blob47FrameIndex(tiles: readonly number[], width: number, index: number, tileId: number): number {
  const height = Math.ceil(tiles.length / width);
  const x = index % width;
  const y = Math.floor(index / width);
  const matches = (offsetX: number, offsetY: number): boolean => {
    const neighborX = x + offsetX;
    const neighborY = y + offsetY;
    if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height) return false;
    return tiles[neighborY * width + neighborX] === tileId;
  };
  return blob47FrameIndexFor(matches);
}
