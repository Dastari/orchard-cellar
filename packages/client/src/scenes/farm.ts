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
  type AtlasMetadata,
  type YSortableSprite,
} from '../render/sprite.js';
import { createPlaceholderTileMap, CachedTileMapRenderer } from '../render/tilemap.js';
import type { Scene } from './scene.js';

const VIEWPORT_WIDTH = 480;
const VIEWPORT_HEIGHT = 270;

export class FarmScene implements Scene {
  private state: FarmState = createInitialState();
  private previousState: FarmState = this.state;
  private readonly camera: Camera;
  private readonly tilemap: CachedTileMapRenderer;
  private readonly avatarAnimator: SpriteAnimator;
  private readonly avatarAtlas: HTMLCanvasElement;

  constructor(private readonly input: InputController, avatarMetadata: AtlasMetadata) {
    this.camera = new Camera(
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
      this.state.collision.width * TILE_SIZE_PIXELS,
      this.state.collision.height * TILE_SIZE_PIXELS,
    );
    this.tilemap = new CachedTileMapRenderer(createPlaceholderTileMap(this.state.collision));
    this.avatarAnimator = new SpriteAnimator(avatarMetadata, 'idle');
    this.avatarAtlas = this.createPlaceholderAvatarAtlas();
  }

  update(): void {
    this.previousState = this.state;
    this.state = advanceTick(
      this.state,
      [{ type: 'move', direction: this.input.getDirection() }],
      this.state.tick + 1,
    );
    this.avatarAnimator.setAnimation(this.state.player.moving ? 'walk' : 'idle');
    this.avatarAnimator.update();
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
    const mailbox: YSortableSprite = {
      y: 190 - this.camera.y,
      draw: (target) => this.drawMailbox(target, 150 - this.camera.x, 190 - this.camera.y),
    };
    drawYSorted(context, [avatar, mailbox]);
    this.tilemap.drawLayer(context, this.camera, 'canopy');
    this.drawHud(context);
  }

  private drawAvatar(context: CanvasRenderingContext2D, x: number, y: number): void {
    const frame = this.avatarAnimator.getFrame();
    if (frame) drawAtlasFrame(context, this.avatarAtlas, frame, x, y + 8);
  }

  private createPlaceholderAvatarAtlas(): HTMLCanvasElement {
    const atlas = document.createElement('canvas');
    atlas.width = 32;
    atlas.height = 20;
    const context = atlas.getContext('2d');
    if (!context) return atlas;
    for (const offset of [0, 16]) {
      context.fillStyle = '#2a293b';
      context.fillRect(offset + 3, 0, 10, 5);
      context.fillStyle = '#efbf88';
      context.fillRect(offset + 4, 5, 8, 7);
      context.fillStyle = '#4c6190';
      context.fillRect(offset + 3, 12, 10, 5);
    }
    context.fillStyle = '#45342e';
    context.fillRect(3, 17, 4, 3);
    context.fillRect(9, 17, 4, 3);
    context.fillRect(18, 17, 4, 3);
    context.fillRect(27, 17, 4, 3);
    return atlas;
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
