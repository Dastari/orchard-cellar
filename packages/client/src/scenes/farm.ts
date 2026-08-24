import {
  FIXED_UNITS_PER_PIXEL,
  SEASONS,
  TILE_SIZE_FIXED,
  TILE_SIZE_PIXELS,
  TICKS_PER_DAY,
  advanceTick,
  calendarAtTick,
  createInitialState,
  nextDayTick,
  type Action,
  type FarmState,
  type Season,
} from '@orchard/sim';
import type { GameAudio } from '../audio/audio-bus.js';
import { InputController } from '../input/input.js';
import type { LoadedAsset } from '../render/assets.js';
import { drawBitmapText } from '../render/bitmap-font.js';
import { Camera } from '../render/camera.js';
import type { MapObjectSource, MapSource } from '../render/map-source.js';
import { SpriteAnimator, drawAtlasFrame, drawYSorted, type AtlasFrame, type YSortableSprite } from '../render/sprite.js';
import { CachedTileMapRenderer, createAuthoredTileMap } from '../render/tilemap.js';
import type { Scene } from './scene.js';

const VIEWPORT_WIDTH = 480;
const VIEWPORT_HEIGHT = 270;

export interface SeasonalFarmAssets {
  readonly grass: LoadedAsset;
  readonly path: LoadedAsset;
  readonly soil: LoadedAsset;
  readonly farmhouse: LoadedAsset;
  readonly fruitTree: LoadedAsset;
}

export interface FarmAssets {
  readonly avatar: LoadedAsset;
  readonly seasons: Readonly<Record<Season, SeasonalFarmAssets>>;
  readonly press: LoadedAsset;
  readonly barrel: LoadedAsset;
  readonly maps: Readonly<Record<'estate' | 'cellar', MapSource>>;
}

function atlasFrame(asset: LoadedAsset, animation = 'base', frameIndex = 0): { image: CanvasImageSource; frame: AtlasFrame } | undefined {
  const frame = asset.metadata.animations[animation]?.[frameIndex];
  return frame ? { image: asset.image, frame } : undefined;
}

function nearTile(state: FarmState, x: number, y: number, radius = 2): boolean {
  const playerX = state.player.position.x / TILE_SIZE_FIXED;
  const playerY = state.player.position.y / TILE_SIZE_FIXED;
  return Math.abs(playerX - x) <= radius && Math.abs(playerY - y) <= radius;
}

export class FarmScene implements Scene {
  private state: FarmState;
  private previousState: FarmState;
  private camera: Camera;
  private readonly estateTilemaps: Readonly<Record<Season, CachedTileMapRenderer>>;
  private readonly cellarTilemap: CachedTileMapRenderer;
  private readonly avatarAnimator: SpriteAnimator;
  private lastFootstepTick = 0;

  constructor(
    private readonly input: InputController,
    private readonly assets: FarmAssets,
    initialState: FarmState | null,
    private readonly audio: GameAudio,
    private readonly onStateChanged: (state: FarmState) => void,
  ) {
    this.state = initialState ?? createInitialState();
    this.previousState = this.state;
    this.camera = this.createCamera();
    this.estateTilemaps = Object.fromEntries(SEASONS.map((season) => {
      const seasonAssets = assets.seasons[season];
      return [season, new CachedTileMapRenderer(createAuthoredTileMap(assets.maps.estate, {
        season,
        grass: atlasFrame(seasonAssets.grass, 'base', seasonAssets.grass.metadata.animations['base']?.length === 47 ? 46 : 0),
        path: atlasFrame(seasonAssets.path, 'base', seasonAssets.path.metadata.animations['base']?.length === 47 ? 46 : 0),
        soil: atlasFrame(seasonAssets.soil, 'base', seasonAssets.soil.metadata.animations['base']?.length === 47 ? 46 : 0),
      }))];
    })) as unknown as Readonly<Record<Season, CachedTileMapRenderer>>;
    this.cellarTilemap = new CachedTileMapRenderer(createAuthoredTileMap(assets.maps.cellar));
    this.avatarAnimator = new SpriteAnimator(assets.avatar.metadata, 'walk_down');
    const calendar = calendarAtTick(this.state.tick);
    this.audio.setAmbienceContext(calendar.season, calendar.dayProgress, this.state.player.location);
    void this.audio.setSeason(calendar.season);
  }

  getState(): FarmState { return this.state; }

  devWarp(kind: 'day' | 'season'): void {
    const previousSeason = calendarAtTick(this.state.tick).season;
    const tick = kind === 'day' ? nextDayTick(this.state.tick) : this.state.tick + TICKS_PER_DAY * 7;
    this.previousState = this.state;
    this.state = advanceTick(this.state, [{ type: 'move', direction: null }], tick);
    const season = calendarAtTick(this.state.tick).season;
    if (season !== previousSeason) void this.audio.setSeason(season);
    this.updateAudioContext();
    this.onStateChanged(this.state);
  }

  devToggleLocation(): void {
    this.previousState = this.state;
    this.state = advanceTick(this.state, [{ type: 'transition', location: this.state.player.location === 'estate' ? 'cellar' : 'estate' }], this.state.tick + 1);
    this.camera = this.createCamera();
    this.updateAudioContext();
    this.onStateChanged(this.state);
  }

  devSetDayProgress(progress: number): void {
    const clamped = Math.min(0.999, Math.max(0, progress));
    const dayStart = Math.floor(this.state.tick / TICKS_PER_DAY) * TICKS_PER_DAY;
    this.previousState = this.state;
    this.state = advanceTick(this.state, [{ type: 'move', direction: null }], dayStart + Math.floor(clamped * TICKS_PER_DAY));
    this.updateAudioContext();
    this.onStateChanged(this.state);
  }

  update(): void {
    this.previousState = this.state;
    let tick = this.state.tick + 1;
    const actions: Action[] = [{ type: 'move', direction: this.input.getDirection() }];
    const warp = this.input.consumeDevWarp();
    if (warp === 'day') tick = nextDayTick(this.state.tick);
    if (warp === 'season') tick = this.state.tick + TICKS_PER_DAY * 7;
    if (this.input.consumeDevToggleLocation()) {
      actions.push({ type: 'transition', location: this.state.player.location === 'estate' ? 'cellar' : 'estate' });
    } else if (this.input.consumeInteract()) {
      const transition = this.assets.maps[this.state.player.location].transitions.find((candidate) => nearTile(this.state, candidate.x, candidate.y, candidate.radius));
      if (transition) actions.push({ type: 'transition', location: transition.target });
      void this.audio.playSfx('ui_confirm');
    }
    const previousLocation = this.state.player.location;
    const previousSeason = calendarAtTick(this.state.tick).season;
    this.state = advanceTick(this.state, actions, tick);
    if (this.state.player.location !== previousLocation) this.camera = this.createCamera();
    const calendar = calendarAtTick(this.state.tick);
    this.audio.setAmbienceContext(calendar.season, calendar.dayProgress, this.state.player.location);
    if (calendar.season !== previousSeason) void this.audio.setSeason(calendar.season);
    this.avatarAnimator.setAnimation(this.animationForFacing());
    if (this.state.player.moving) {
      this.avatarAnimator.update();
      if (this.state.tick - this.lastFootstepTick >= 18) {
        this.lastFootstepTick = this.state.tick;
        void this.audio.playFootstep(this.footstepSurface());
      }
    } else {
      this.avatarAnimator.reset();
    }
    const playerX = this.state.player.position.x / FIXED_UNITS_PER_PIXEL;
    const playerY = this.state.player.position.y / FIXED_UNITS_PER_PIXEL;
    this.camera.follow(playerX, playerY);
    if (this.state.tick % 300 === 0 || warp !== null || this.state.player.location !== previousLocation) this.onStateChanged(this.state);
  }

  render(context: CanvasRenderingContext2D, alpha: number): void {
    const calendar = calendarAtTick(this.state.tick);
    const tilemap = this.state.player.location === 'cellar' ? this.cellarTilemap : this.estateTilemaps[calendar.season];
    tilemap.drawLayer(context, this.camera, 'ground');
    tilemap.drawLayer(context, this.camera, 'detail');
    const current = this.state.player.position;
    const previous = this.previousState.player.position;
    const worldX = (previous.x + (current.x - previous.x) * alpha) / FIXED_UNITS_PER_PIXEL;
    const worldY = (previous.y + (current.y - previous.y) * alpha) / FIXED_UNITS_PER_PIXEL;
    const screenX = Math.round(worldX - this.camera.x);
    const screenY = Math.round(worldY - this.camera.y);
    const avatar: YSortableSprite = { y: screenY, draw: (target) => this.drawAvatar(target, screenX, screenY) };
    const sprites = this.state.player.location === 'estate' ? this.estateSprites(calendar.season, avatar) : this.cellarSprites(avatar);
    drawYSorted(context, sprites);
    tilemap.drawLayer(context, this.camera, 'canopy');
    this.drawLighting(context, calendar.dayProgress);
    this.drawHud(context);
  }

  private createCamera(): Camera {
    const map = this.assets.maps[this.state.player.location];
    const camera = new Camera(VIEWPORT_WIDTH, VIEWPORT_HEIGHT, map.size[0] * TILE_SIZE_PIXELS, map.size[1] * TILE_SIZE_PIXELS);
    camera.follow(this.state.player.position.x / FIXED_UNITS_PER_PIXEL, this.state.player.position.y / FIXED_UNITS_PER_PIXEL);
    return camera;
  }

  private estateSprites(season: Season, avatar: YSortableSprite): YSortableSprite[] {
    return [avatar, ...this.assets.maps.estate.objects.map((object) => this.objectSprite(object, season))];
  }

  private cellarSprites(avatar: YSortableSprite): YSortableSprite[] {
    return [avatar, ...this.assets.maps.cellar.objects.map((object) => this.objectSprite(object, calendarAtTick(this.state.tick).season))];
  }

  private objectSprite(object: MapObjectSource, season: Season): YSortableSprite {
    const seasonAssets = this.assets.seasons[season];
    if (object.asset === 'cellar_door') {
      return { y: object.y * 16 - this.camera.y, draw: (target) => this.drawCellarDoor(target, object.x * 16 - this.camera.x, object.y * 16 - this.camera.y) };
    }
    const asset = object.asset === 'farmhouse' ? seasonAssets.farmhouse
      : object.asset === 'tree_apple_fruiting' ? seasonAssets.fruitTree
        : object.asset === 'prop_basket_press' ? this.assets.press : this.assets.barrel;
    return this.worldAssetSprite(asset, object.animation, object.x * 16, object.y * 16);
  }

  private drawAvatar(context: CanvasRenderingContext2D, x: number, y: number): void {
    const frame = this.avatarAnimator.getFrame();
    if (frame) drawAtlasFrame(context, this.assets.avatar.image, frame, x, y + 8);
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
        const frames = asset.metadata.animations[animation] ?? [];
        const frame = frames[Math.floor(this.state.tick / 40) % Math.max(1, frames.length)];
        if (!frame) return;
        context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height,
          Math.round(worldX - asset.anchor[0] - this.camera.x), Math.round(worldY - asset.anchor[1] - this.camera.y), frame.width, frame.height);
      },
    };
  }

  private drawCellarDoor(context: CanvasRenderingContext2D, x: number, y: number): void {
    context.fillStyle = '#315938'; context.fillRect(x - 18, y - 12, 36, 12);
    context.fillStyle = '#2b1d0e'; context.fillRect(x - 8, y - 14, 16, 14);
    context.fillStyle = '#a97744'; context.fillRect(x - 5, y - 11, 10, 11);
  }

  private drawLighting(context: CanvasRenderingContext2D, progress: number): void {
    if (this.state.player.location === 'cellar') {
      context.fillStyle = '#3d241814'; context.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT); return;
    }
    if (progress < 0.12) context.fillStyle = `rgba(218, 105, 70, ${0.22 * (1 - progress / 0.12)})`;
    else if (progress > 0.78) context.fillStyle = `rgba(25, 31, 76, ${Math.min(0.48, (progress - 0.78) / 0.22 * 0.48)})`;
    else if (progress > 0.65) context.fillStyle = `rgba(105, 65, 105, ${(progress - 0.65) / 0.13 * 0.18})`;
    else return;
    context.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  }

  private drawHud(context: CanvasRenderingContext2D): void {
    const calendar = calendarAtTick(this.state.tick);
    context.fillStyle = '#182018dd'; context.fillRect(6, 6, 150, 18);
    context.strokeStyle = '#d5b568'; context.strokeRect(6.5, 6.5, 149, 17);
    drawBitmapText(context, this.state.player.location === 'cellar' ? 'CELLAR E TO EXIT' : 'WASD WALK E USE', 12, 12, '#f5e5b8', 1);
    const dialX = 454; const dialY = 18;
    const seasonColors: Record<Season, string> = { spring: '#d4699b', summer: '#58a346', autumn: '#e0a62d', winter: '#84b8c4' };
    context.fillStyle = '#182018dd'; context.beginPath(); context.arc(dialX, dialY, 14, 0, Math.PI * 2); context.fill();
    context.strokeStyle = seasonColors[calendar.season]; context.lineWidth = 2; context.beginPath(); context.arc(dialX, dialY, 12, 0, Math.PI * 2); context.stroke();
    const angle = calendar.dayProgress * Math.PI * 2 - Math.PI / 2;
    context.fillStyle = calendar.dayProgress > 0.78 ? '#f5e5b8' : '#ffe98a';
    context.fillRect(Math.round(dialX + Math.cos(angle) * 9) - 1, Math.round(dialY + Math.sin(angle) * 9) - 1, 3, 3);
    drawBitmapText(context, `D${calendar.dayOfSeason}`, dialX - 6, dialY - 2, '#f5e5b8', 1);
    const hour = String(calendar.hour).padStart(2, '0'); const minute = String(calendar.minute).padStart(2, '0');
    context.fillStyle = '#182018dd'; context.fillRect(352, 6, 78, 18);
    drawBitmapText(context, `${calendar.season.slice(0, 3)} ${hour}:${minute}`, 358, 12, '#f5e5b8', 1);
    const transition = this.assets.maps[this.state.player.location].transitions.find((candidate) => nearTile(this.state, candidate.x, candidate.y, candidate.radius));
    if (transition) {
      context.fillStyle = '#f5e5b8ee'; context.fillRect(196, 224, 88, 14);
      drawBitmapText(context, this.state.player.location === 'estate' ? 'E ENTER CELLAR' : 'E RETURN FARM', 202, 229, '#2b1d0e', 1);
    }
  }

  private footstepSurface(): 'grass' | 'path' | 'cellar' {
    if (this.state.player.location === 'cellar') return 'cellar';
    const x = this.state.player.position.x / TILE_SIZE_FIXED; const y = this.state.player.position.y / TILE_SIZE_FIXED;
    return (x >= 27 && x <= 29 && y >= 10 && y <= 46) || (y >= 44 && y <= 46 && x >= 27 && x <= 36) ? 'path' : 'grass';
  }

  private updateAudioContext(): void {
    const calendar = calendarAtTick(this.state.tick);
    this.audio.setAmbienceContext(calendar.season, calendar.dayProgress, this.state.player.location);
  }
}
