import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_PIXELS,
  advanceTick,
  createInitialState,
  type FarmState,
} from '@orchard/sim';
import { InputController } from '../input/input.js';
import { drawBitmapText } from '../render/bitmap-font.js';
import { Camera } from '../render/camera.js';
import {
  SpriteAnimator,
  drawAtlasFrame,
  drawYSorted,
  type YSortableSprite,
} from '../render/sprite.js';
import { createPlaceholderTileMap, CachedTileMapRenderer } from '../render/tilemap.js';
import type { LoadedAsset } from '../render/assets.js';
import type { Scene } from './scene.js';

const VIEWPORT_WIDTH = 480;
const VIEWPORT_HEIGHT = 270;

export class FarmScene implements Scene {
  private state: FarmState = createInitialState();
  private previousState: FarmState = this.state;
  private readonly camera: Camera;
  private readonly tilemap: CachedTileMapRenderer;
  private readonly avatarAnimator: SpriteAnimator;
  private readonly avatarAsset: LoadedAsset;

  constructor(
    private readonly input: InputController,
    avatarAsset: LoadedAsset,
    grassAsset: LoadedAsset,
    private readonly farmhouseAsset: LoadedAsset,
    private readonly fruitTreeAsset: LoadedAsset,
  ) {
    this.camera = new Camera(
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
      this.state.collision.width * TILE_SIZE_PIXELS,
      this.state.collision.height * TILE_SIZE_PIXELS,
    );
    const grassFrame = grassAsset?.metadata.animations['base']?.at(-1);
    const grassAtlas = grassAsset && grassFrame ? { image: grassAsset.image, frame: grassFrame } : undefined;
    this.tilemap = new CachedTileMapRenderer(createPlaceholderTileMap(this.state.collision, grassAtlas));
    this.avatarAsset = avatarAsset;
    this.avatarAnimator = new SpriteAnimator(avatarAsset.metadata, 'walk_down');
  }

  update(): void {
    this.previousState = this.state;
    this.state = advanceTick(
      this.state,
      [{ type: 'move', direction: this.input.getDirection() }],
      this.state.tick + 1,
    );
    this.avatarAnimator.setAnimation(this.animationForFacing());
    if (this.state.player.moving) this.avatarAnimator.update();
    else this.avatarAnimator.reset();
    const playerX = this.state.player.position.x / FIXED_UNITS_PER_PIXEL;
    const playerY = this.state.player.position.y / FIXED_UNITS_PER_PIXEL;
    this.camera.follow(playerX, playerY);
  }

  render(context: CanvasRenderingContext2D, alpha: number): void {
    this.tilemap.drawLayer(context, this.camera, 'ground');
    this.tilemap.drawLayer(context, this.camera, 'detail');

    const current = this.state.player.position;
    const previous = this.previousState.player.position;
    const worldX = (previous.x + (current.x - previous.x) * alpha) / FIXED_UNITS_PER_PIXEL;
    const worldY = (previous.y + (current.y - previous.y) * alpha) / FIXED_UNITS_PER_PIXEL;
    const screenX = Math.round(worldX - this.camera.x);
    const screenY = Math.round(worldY - this.camera.y);
    const avatar: YSortableSprite = {
      y: screenY,
      draw: (target) => this.drawAvatar(target, screenX, screenY),
    };
    const farmhouse = this.worldAssetSprite(this.farmhouseAsset, 'base', 20 * 16, 13 * 16);
    const fruitTree = this.worldAssetSprite(this.fruitTreeAsset, 'fruiting', 12 * 16, 14 * 16);
    const mailbox: YSortableSprite = {
      y: 190 - this.camera.y,
      draw: (target) => this.drawMailbox(target, 150 - this.camera.x, 190 - this.camera.y),
    };
    drawYSorted(context, [avatar, mailbox, farmhouse, fruitTree]);
    this.tilemap.drawLayer(context, this.camera, 'canopy');
    this.drawHud(context);
  }

  private drawAvatar(context: CanvasRenderingContext2D, x: number, y: number): void {
    const frame = this.avatarAnimator.getFrame();
    if (frame) drawAtlasFrame(context, this.avatarAsset.image, frame, x, y + 8);
  }

  private animationForFacing(): string {
    const facing = this.state.player.facing;
    if (facing.includes('Left') || facing === 'left') return 'walk_left';
    if (facing.includes('Right') || facing === 'right') return 'walk_right';
    if (facing.startsWith('up')) return 'walk_up';
    return 'walk_down';
  }

  private worldAssetSprite(asset: LoadedAsset, animation: string, worldX: number, worldY: number): YSortableSprite {
    return {
      y: worldY - this.camera.y,
      draw: (context) => {
        const frame = asset.metadata.animations[animation]?.[Math.floor(this.state.tick / 40) % (asset.metadata.animations[animation]?.length ?? 1)];
        if (!frame) return;
        context.drawImage(
          asset.image,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          Math.round(worldX - asset.anchor[0] - this.camera.x),
          Math.round(worldY - asset.anchor[1] - this.camera.y),
          frame.width,
          frame.height,
        );
      },
    };
  }

  private drawMailbox(context: CanvasRenderingContext2D, x: number, y: number): void {
    context.fillStyle = '#5a382d';
    context.fillRect(x - 2, y - 8, 4, 16);
    context.fillStyle = '#c67f49';
    context.fillRect(x - 7, y - 14, 14, 8);
  }

  private drawHud(context: CanvasRenderingContext2D): void {
    context.fillStyle = '#182018dd';
    context.fillRect(6, 6, 184, 18);
    context.strokeStyle = '#d5b568';
    context.strokeRect(6.5, 6.5, 183, 17);
    drawBitmapText(context, 'WASD OR ARROW KEYS TO WALK', 12, 12, '#f5e5b8', 1);
    context.fillStyle = '#182018cc';
    context.fillRect(414, 6, 60, 14);
    context.fillStyle = '#f5e5b8';
    context.font = '8px monospace';
    context.textAlign = 'center';
    context.fillText(`TICK ${this.state.tick}`, 444, 16);
  }
}
