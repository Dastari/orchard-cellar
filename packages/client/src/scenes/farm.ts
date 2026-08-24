import {
  FIXED_UNITS_PER_PIXEL,
  CASK_BALANCE,
  CASK_COST_GROWTH,
  ORCHARD_PLOTS,
  PLOT_CLEARINGS,
  PRESS_BALANCE,
  PRESS_COST_GROWTH,
  SEASONS,
  TILE_SIZE_FIXED,
  TILE_SIZE_PIXELS,
  TICKS_PER_DAY,
  WORKBENCH_UPGRADES,
  YARD_MUST_CAPACITY,
  advanceTick,
  calendarAtTick,
  createInitialState,
  nextDayTick,
  repeatCost,
  type Action,
  type FarmState,
  type OrchardTreeState,
  type Season,
} from '@orchard/sim';
import type { GameAudio } from '../audio/audio-bus.js';
import { InputController } from '../input/input.js';
import type { LoadedAsset } from '../render/assets.js';
import { drawBitmapText } from '../render/bitmap-font.js';
import { Camera } from '../render/camera.js';
import type { MapObjectSource, MapSource } from '../render/map-source.js';
import { SpriteAnimator, atlasFrames, drawAtlasFrame, drawYSorted, selectAtlasFrame, type AtlasFrame, type YSortableSprite } from '../render/sprite.js';
import { CachedTileMapRenderer, createAuthoredTileMap } from '../render/tilemap.js';
import type { Scene } from './scene.js';

const VIEWPORT_WIDTH = 480;
const VIEWPORT_HEIGHT = 270;

export interface SeasonalFarmAssets {
  readonly grassBase: LoadedAsset;
  readonly grassDetail: LoadedAsset;
  readonly path: LoadedAsset;
  readonly soil: LoadedAsset;
  readonly farmhouse: LoadedAsset;
  readonly treeSapling: LoadedAsset;
  readonly treeYoung: LoadedAsset;
  readonly treeMature: LoadedAsset;
  readonly fruitTree: LoadedAsset;
  readonly scenery: Readonly<Record<string, LoadedAsset>>;
}

export interface FarmAssets {
  readonly avatar: LoadedAsset;
  readonly seasons: Readonly<Record<Season, SeasonalFarmAssets>>;
  readonly press: LoadedAsset;
  readonly barrel: LoadedAsset;
  readonly worldTiles: {
    readonly water: LoadedAsset;
    readonly waterDetail: LoadedAsset;
    readonly cellarFloor: LoadedAsset;
    readonly cellarWall: LoadedAsset;
    readonly hillside: LoadedAsset;
    readonly cellarRack: LoadedAsset;
  };
  readonly maps: Readonly<Record<'estate' | 'cellar', MapSource>>;
}

function atlasFrame(asset: LoadedAsset, animation = 'base', frameIndex = 0): { image: CanvasImageSource; frame: AtlasFrame } | undefined {
  const frame = selectAtlasFrame(asset.metadata, animation, frameIndex);
  return frame ? { image: asset.image, frame } : undefined;
}

function blob47Atlas(asset: LoadedAsset): {
  image: CanvasImageSource;
  frame: AtlasFrame;
  frames: readonly AtlasFrame[];
  autotile: 'blob47';
} | undefined {
  const frames = asset.metadata.variants?.['base'] ?? [];
  const frame = frames[46] ?? frames[0];
  return frame ? { image: asset.image, frame, frames, autotile: 'blob47' } : undefined;
}

function nearTile(state: FarmState, x: number, y: number, radius = 2): boolean {
  return targetScore(state, x, y, radius) !== undefined;
}

export function targetScore(state: FarmState, x: number, y: number, radius: number): number | undefined {
  const playerX = state.player.position.x / TILE_SIZE_FIXED;
  const playerY = state.player.position.y / TILE_SIZE_FIXED;
  const dx = x - playerX;
  const dy = y - playerY;
  const distance = Math.hypot(dx, dy);
  if (distance > radius + 0.5) return undefined;
  if (distance < 0.5) return distance;
  const facing = state.player.facing;
  const facingX = facing.includes('Left') || facing === 'left' ? -1 : facing.includes('Right') || facing === 'right' ? 1 : 0;
  const facingY = facing.startsWith('up') ? -1 : facing.startsWith('down') || facing === 'down' ? 1 : 0;
  const facingLength = Math.hypot(facingX, facingY) || 1;
  const dot = (dx * facingX + dy * facingY) / (distance * facingLength);
  return dot >= 0.15 ? distance - dot * 0.25 : undefined;
}

export function nearTree(state: FarmState, radius?: number): OrchardTreeState | undefined {
  const reach = radius ?? (state.economy.upgrades.includes('tallLadders') ? 4 : 2);
  return state.economy.trees
    .map((tree) => ({ tree, score: targetScore(state, tree.x, tree.y, reach) }))
    .filter((candidate): candidate is { tree: OrchardTreeState; score: number } => candidate.score !== undefined)
    .sort((a, b) => a.score - b.score || a.tree.id - b.tree.id)[0]?.tree;
}

export function nearOpenPlot(state: FarmState, radius = 2): readonly [number, number] | undefined {
  const occupied = new Set(state.economy.trees.map((tree) => `${tree.x},${tree.y}`));
  return ORCHARD_PLOTS.slice(0, state.economy.plotsUnlocked)
    .filter(([x, y]) => !occupied.has(`${x},${y}`))
    .map((plot) => ({ plot, score: targetScore(state, plot[0], plot[1], radius) }))
    .filter((candidate): candidate is { plot: readonly [number, number]; score: number } => candidate.score !== undefined)
    .sort((a, b) => a.score - b.score || a.plot[1] - b.plot[1] || a.plot[0] - b.plot[0])[0]?.plot;
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
        grassBase: atlasFrame(seasonAssets.grassBase),
        grass: atlasFrame(seasonAssets.grassDetail),
        path: blob47Atlas(seasonAssets.path),
        soil: atlasFrame(seasonAssets.soil, 'base', atlasFrames(seasonAssets.soil.metadata, 'base').length === 47 ? 46 : 0),
        water: atlasFrame(assets.worldTiles.water),
        waterDetail: atlasFrame(assets.worldTiles.waterDetail),
        hillside: atlasFrame(assets.worldTiles.hillside),
      }))];
    })) as unknown as Readonly<Record<Season, CachedTileMapRenderer>>;
    this.cellarTilemap = new CachedTileMapRenderer(createAuthoredTileMap(assets.maps.cellar, {
      cellarFloor: atlasFrame(assets.worldTiles.cellarFloor),
      cellarWall: atlasFrame(assets.worldTiles.cellarWall),
      cellarRack: atlasFrame(assets.worldTiles.cellarRack),
    }));
    this.avatarAnimator = new SpriteAnimator(assets.avatar.metadata, 'walk_down');
    const calendar = calendarAtTick(this.state.tick);
    this.audio.setAmbienceContext(calendar.season, calendar.dayProgress, this.state.player.location);
    void this.audio.setSeason(calendar.season);
  }

  getState(): FarmState { return this.state; }

  devDispatch(action: Action): void {
    this.previousState = this.state;
    this.state = advanceTick(this.state, [{ type: 'move', direction: null }, action], this.state.tick + 1);
    this.onStateChanged(this.state);
  }

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
      const context = transition ? [{ type: 'transition', location: transition.target } satisfies Action] : this.contextActions();
      actions.push(...context);
      void this.audio.playSfx(context.length > 0 ? 'ui_confirm' : 'ui_hover');
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
    if (this.state.player.location === 'estate') this.drawPressStatus(context);
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
    const scenery = this.assets.maps.estate.objects
      .filter((object) => object.asset !== 'tree_apple_fruiting')
      .map((object) => this.objectSprite(object, season));
    const trees = this.state.economy.trees.map((tree) => this.treeSprite(tree, season));
    return [avatar, ...scenery, ...trees];
  }

  private cellarSprites(avatar: YSortableSprite): YSortableSprite[] {
    const season = calendarAtTick(this.state.tick).season;
    const caskCount = this.state.economy.casks.reduce((sum, count) => sum + count, 0);
    const fixed = this.assets.maps.cellar.objects.filter((object) => object.asset !== 'prop_oak_barrel');
    const casks = this.assets.maps.cellar.objects.filter((object) => object.asset === 'prop_oak_barrel').slice(0, caskCount);
    return [avatar, ...[...fixed, ...casks].map((object) => this.objectSprite(object, season))];
  }

  private objectSprite(object: MapObjectSource, season: Season): YSortableSprite {
    const seasonAssets = this.assets.seasons[season];
    if (object.asset === 'cellar_door') {
      return { y: object.y * 16 - this.camera.y, draw: (target) => this.drawCellarDoor(target, object.x * 16 - this.camera.x, object.y * 16 - this.camera.y) };
    }
    const asset = object.asset === 'farmhouse' ? seasonAssets.farmhouse
      : object.asset === 'tree_apple_fruiting' ? seasonAssets.fruitTree
        : object.asset === 'prop_basket_press' ? this.assets.press
          : object.asset === 'prop_oak_barrel' ? this.assets.barrel
            : seasonAssets.scenery[object.asset];
    if (!asset) throw new Error(`Missing loaded map asset: ${object.asset}`);
    return this.worldAssetSprite(asset, object.animation, object.x * 16, object.y * 16);
  }

  private treeSprite(tree: OrchardTreeState, season: Season): YSortableSprite {
    const seasonal = this.assets.seasons[season];
    const asset = tree.stage === 'sapling' ? seasonal.treeSapling
      : tree.stage === 'young' ? seasonal.treeYoung
        : tree.bufferMicro >= 1_000_000 ? seasonal.fruitTree : seasonal.treeMature;
    return this.worldAssetSprite(asset, 'base', tree.x * 16, tree.y * 16);
  }

  private drawAvatar(context: CanvasRenderingContext2D, x: number, y: number): void {
    const frame = this.avatarAnimator.getFrame();
    if (!frame) return;
    const facing = this.state.player.facing;
    const mirror = facing.includes('Left') || facing === 'left';
    if (!mirror) {
      drawAtlasFrame(context, this.assets.avatar.image, frame, x, y + 8);
      return;
    }
    context.save();
    context.translate(x * 2, 0);
    context.scale(-1, 1);
    drawAtlasFrame(context, this.assets.avatar.image, frame, x, y + 8);
    context.restore();
  }

  private animationForFacing(): string {
    const facing = this.state.player.facing;
    if (facing.includes('Left') || facing === 'left' || facing.includes('Right') || facing === 'right') return 'walk_right';
    if (facing.startsWith('up')) return 'walk_up';
    return 'walk_down';
  }

  private worldAssetSprite(asset: LoadedAsset, animation: string, worldX: number, worldY: number): YSortableSprite {
    return {
      y: worldY - this.camera.y,
      draw: (context) => {
        const frames = atlasFrames(asset.metadata, animation);
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

  private drawPressStatus(context: CanvasRenderingContext2D): void {
    const economy = this.state.economy;
    const status = !economy.firstPressRepaired ? 'BROKEN'
      : !economy.upgrades.includes('copperPipe') && economy.yardMustMicro >= YARD_MUST_CAPACITY * 1_000_000 ? 'BACKED'
        : economy.hopperFruitMicro <= 0 ? 'STARVED' : 'WORKING';
    const x = Math.round(10 * TILE_SIZE_PIXELS - this.camera.x);
    const y = Math.round(47 * TILE_SIZE_PIXELS - this.camera.y - 24);
    if (x < -50 || x > VIEWPORT_WIDTH + 10 || y < -12 || y > VIEWPORT_HEIGHT) return;
    const width = status.length * 6 + 8;
    context.fillStyle = status === 'WORKING' ? '#315938ee' : '#f5e5b8ee';
    context.fillRect(x - Math.floor(width / 2), y, width, 12);
    drawBitmapText(context, status, x - Math.floor(width / 2) + 4, y + 4, status === 'WORKING' ? '#f5e5b8' : '#2b1d0e', 1);
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
    context.fillStyle = '#182018dd'; context.fillRect(6, 6, 212, 18);
    context.strokeStyle = '#d5b568'; context.strokeRect(6.5, 6.5, 211, 17);
    const resources = this.state.economy.resources;
    drawBitmapText(context, `F${resources.fruit} P${resources.pomace} M${resources.must} B${resources.bottles}`, 12, 12, '#f5e5b8', 1);
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
    const prompt = this.contextPrompt();
    if (prompt) {
      const width = Math.min(210, prompt.length * 6 + 12);
      context.fillStyle = '#f5e5b8ee'; context.fillRect(240 - width / 2, 218, width, 14);
      drawBitmapText(context, prompt, Math.round(246 - width / 2), 223, '#2b1d0e', 1);
    }
    context.fillStyle = '#182018dd'; context.fillRect(126, 246, 228, 18);
    context.fillStyle = '#3d3130'; context.fillRect(132, 251, 120, 8);
    context.fillStyle = '#d5b568'; context.fillRect(132, 251, Math.floor(120 * this.state.economy.vigour / 10_000), 8);
    drawBitmapText(context, `VIGOUR ${Math.floor(this.state.economy.vigour / 100)} HOLD E RELEASE TO USE`, 258, 252, '#f5e5b8', 1);
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

  private contextActions(): Action[] {
    const tree = nearTree(this.state);
    if (tree && this.state.player.location === 'estate') {
      if (tree.bufferMicro >= 1_000_000) return [{ type: 'harvest', treeId: tree.id }];
      if (tree.care === 3 && this.state.tick >= tree.mulchUntilTick && this.state.economy.resources.pomace >= 5) return [{ type: 'mulch', treeId: tree.id }];
      if (this.state.economy.vigour > 0) return [{ type: 'tend', treeId: tree.id }];
      return [];
    }
    const plot = this.state.player.location === 'estate' ? nearOpenPlot(this.state) : undefined;
    if (plot) return [{ type: 'plant', species: 'seedlingApple', x: plot[0], y: plot[1] }];
    if (this.state.player.location === 'estate' && nearTile(this.state, 10, 47, 3)) {
      const economy = this.state.economy;
      if (!economy.firstPressRepaired) return [{ type: 'repairPress' }];
      if (economy.resources.fruit > 0) return [{ type: 'haulFruit' }];
      if (economy.yardMustMicro >= 1_000_000) return [{ type: 'haulMust', destination: 'bank' }];
      const basketCost = repeatCost(PRESS_BALANCE[0]?.cost ?? 25, economy.presses[0] ?? 0, PRESS_COST_GROWTH);
      if (economy.resources.pomace >= basketCost) return [{ type: 'buyPress', tier: 1 }];
      return [];
    }
    if (this.state.player.location === 'estate' && nearTile(this.state, 28, 11, 2)) {
      const economy = this.state.economy;
      const upgrade = WORKBENCH_UPGRADES.find((candidate) => !economy.upgrades.includes(candidate.id)
        && economy.resources[candidate.currency] >= candidate.cost);
      if (upgrade) return [{ type: 'buyUpgrade', id: upgrade.id }];
      const clearingIndex = PLOT_CLEARINGS.findIndex((candidate) => candidate.plots === economy.plotsUnlocked);
      const clearing = PLOT_CLEARINGS[clearingIndex + 1];
      if (clearing && economy.resources.fruit >= clearing.fruitCost) return [{ type: 'clearPlots' }];
      return [];
    }
    if (this.state.player.location === 'cellar' && nearTile(this.state, 19, 7, 3)) {
      if (this.state.economy.casks.every((count) => count === 0)) return [{ type: 'buyCask', tier: 1 }];
      const nextCost = repeatCost(CASK_BALANCE[0]?.cost ?? 40, this.state.economy.casks[0] ?? 0, CASK_COST_GROWTH);
      if (this.state.economy.cellarMustMicro > 0 && this.state.economy.resources.must >= nextCost) return [{ type: 'buyCask', tier: 1 }];
      if (this.state.economy.resources.must > 0) return [{ type: 'rackMust' }];
    }
    return [];
  }

  private contextPrompt(): string | null {
    const transition = this.assets.maps[this.state.player.location].transitions.find((candidate) => nearTile(this.state, candidate.x, candidate.y, candidate.radius));
    if (transition) return this.state.player.location === 'estate' ? 'E ENTER CELLAR' : 'E RETURN FARM';
    const tree = nearTree(this.state);
    const held = this.input.isInteractHeld() ? 'RELEASE' : 'HOLD E';
    if (tree && this.state.player.location === 'estate') {
      if (tree.bufferMicro >= 1_000_000) return `${held} HARVEST ${Math.floor(tree.bufferMicro / 1_000_000)}`;
      if (tree.care === 3 && this.state.tick >= tree.mulchUntilTick && this.state.economy.resources.pomace >= 5) return `${held} MULCH 5 POMACE`;
      if (this.state.economy.vigour > 0) return `${held} TEND ${Math.floor(this.state.economy.vigour / 100)} PCT`;
      return 'VIGOUR CHARGING';
    }
    if (this.state.player.location === 'estate' && nearOpenPlot(this.state)) return `${held} PLANT SEEDLING`;
    if (this.state.player.location === 'estate' && nearTile(this.state, 10, 47, 3)) {
      if (!this.state.economy.firstPressRepaired) return `${held} REPAIR PRESS 50 FRUIT`;
      if (this.state.economy.resources.fruit > 0) return `${held} HAUL FRUIT TO HOPPER`;
      if (this.state.economy.yardMustMicro >= 1_000_000) {
        const backed = !this.state.economy.upgrades.includes('copperPipe') && this.state.economy.yardMustMicro >= YARD_MUST_CAPACITY * 1_000_000;
        return `${held} COLLECT MUST ${backed ? 'BACKED' : Math.floor(this.state.economy.yardMustMicro / 1_000_000)}`;
      }
      const basketCost = repeatCost(PRESS_BALANCE[0]?.cost ?? 25, this.state.economy.presses[0] ?? 0, PRESS_COST_GROWTH);
      if (this.state.economy.resources.pomace >= basketCost) return `${held} BUY BASKET PRESS ${basketCost}`;
      return this.state.economy.hopperFruitMicro > 0 ? 'PRESS WORKING' : 'PRESS STARVED NEEDS FRUIT';
    }
    if (this.state.player.location === 'estate' && nearTile(this.state, 28, 11, 2)) {
      const economy = this.state.economy;
      const upgrade = WORKBENCH_UPGRADES.find((candidate) => !economy.upgrades.includes(candidate.id)
        && economy.resources[candidate.currency] >= candidate.cost);
      if (upgrade) return `${held} BUY ${upgrade.name.toUpperCase()} ${upgrade.cost}`;
      const clearingIndex = PLOT_CLEARINGS.findIndex((candidate) => candidate.plots === economy.plotsUnlocked);
      const clearing = PLOT_CLEARINGS[clearingIndex + 1];
      if (clearing && economy.resources.fruit >= clearing.fruitCost) return `${held} CLEAR TO ${clearing.plots} PLOTS ${clearing.fruitCost}`;
      const next = WORKBENCH_UPGRADES.find((candidate) => !economy.upgrades.includes(candidate.id));
      return next ? `NEED ${next.cost} ${next.currency.toUpperCase()} FOR ${next.name.toUpperCase()}` : 'WORKBENCH COMPLETE';
    }
    if (this.state.player.location === 'cellar' && nearTile(this.state, 19, 7, 3)) {
      if (this.state.economy.casks.every((count) => count === 0)) return `${held} BUY DEMIJOHN ${CASK_BALANCE[0]?.cost ?? 40} MUST`;
      const nextCost = repeatCost(CASK_BALANCE[0]?.cost ?? 40, this.state.economy.casks[0] ?? 0, CASK_COST_GROWTH);
      if (this.state.economy.cellarMustMicro > 0 && this.state.economy.resources.must >= nextCost) return `${held} BUY DEMIJOHN ${nextCost}`;
      if (this.state.economy.resources.must > 0) return `${held} RACK MUST INTO CASKS`;
    }
    return null;
  }
}
