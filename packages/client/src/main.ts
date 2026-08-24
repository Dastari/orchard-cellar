import { SEASONS, type Season } from '@orchard/sim';
import { AudioBus } from './audio/audio-bus.js';
import { InputController } from './input/input.js';
import { FixedStepLoop } from './loop.js';
import { loadGeneratedAsset } from './render/assets.js';
import { loadGeneratedMap } from './render/map-source.js';
import { LocalSaveStore } from './save/local-save.js';
import { FarmScene, type SeasonalFarmAssets } from './scenes/farm.js';
import { SceneStack } from './scenes/scene.js';
import './style.css';

const VIRTUAL_WIDTH = 480;
const VIRTUAL_HEIGHT = 270;
const SCENERY_ASSET_NAMES = [
  'building_cf_barn',
  'building_cf_greenhouse',
  'building_cf_windmill',
  'crop_cf_carrot_mature',
  'crop_cf_corn_mature',
  'crop_cf_grapes_mature',
  'crop_cf_pumpkin_mature',
  'crop_cf_tomato_mature',
  'crop_cf_wheat_mature',
  'prop_cf_barrel',
  'prop_cf_barrel_apples',
  'prop_cf_fence_corner',
  'prop_cf_fence_horizontal',
  'prop_cf_fence_vertical',
  'prop_cf_fence_white_horizontal',
  'prop_cf_flowers_gold',
  'prop_cf_flowers_pink',
  'prop_cf_pond',
  'tree_cf_fruit_fruiting',
  'tree_cf_fruit_mature',
] as const;
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing game canvas');
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is unavailable');
const gameCanvas: HTMLCanvasElement = canvas;
const gameContext: CanvasRenderingContext2D = context;

gameContext.imageSmoothingEnabled = false;

function resizeCanvas(): void {
  const scale = Math.max(
    1,
    Math.floor(Math.min(window.innerWidth / VIRTUAL_WIDTH, window.innerHeight / VIRTUAL_HEIGHT)),
  );
  gameCanvas.style.width = `${VIRTUAL_WIDTH * scale}px`;
  gameCanvas.style.height = `${VIRTUAL_HEIGHT * scale}px`;
  gameCanvas.dataset.scale = String(scale);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

async function start(): Promise<void> {
  const input = new InputController(gameCanvas);
  const scenes = new SceneStack();
  const audio = new AudioBus();
  const saveStore = new LocalSaveStore(localStorage);
  const avatarAsset = await loadGeneratedAsset('avatar_cf_farmer', 'summer');
  const seasonEntries = await Promise.all(SEASONS.map(async (season) => {
    const [grassBase, grassDetail, path, soil, farmhouse, treeSapling, treeYoung, treeMature, fruitTree, ...sceneryAssets] = await Promise.all([
      loadGeneratedAsset('tile_cf_grass', season),
      loadGeneratedAsset('tile_cf_grass_tuft', season),
      loadGeneratedAsset('tile_cf_path', season),
      loadGeneratedAsset('tile_cf_farmland', season),
      loadGeneratedAsset('farmhouse', season),
      loadGeneratedAsset('tree_cf_fruit_sapling', season),
      loadGeneratedAsset('tree_cf_fruit_young', season),
      loadGeneratedAsset('tree_cf_fruit_mature', season),
      loadGeneratedAsset('tree_cf_fruit_fruiting', season),
      ...SCENERY_ASSET_NAMES.map(async (name) => await loadGeneratedAsset(name, season)),
    ]);
    const scenery = Object.fromEntries(SCENERY_ASSET_NAMES.map((name, index) => [name, sceneryAssets[index]!]));
    const assets: SeasonalFarmAssets = { grassBase, grassDetail, path, soil, farmhouse, treeSapling, treeYoung, treeMature, fruitTree, scenery };
    return [season, assets] as const;
  }));
  const seasons = Object.fromEntries(seasonEntries) as Record<Season, SeasonalFarmAssets>;
  const [press, barrel, water, waterDetail, cellarFloor, cellarWall, hillside, cellarRack, estateMap, cellarMap] = await Promise.all([
    loadGeneratedAsset('prop_basket_press', 'summer'),
    loadGeneratedAsset('prop_oak_barrel', 'summer'),
    loadGeneratedAsset('tile_cf_water', 'summer'),
    loadGeneratedAsset('tile_cf_water_ripples', 'summer'),
    loadGeneratedAsset('tile_cf_wood_floor', 'summer'),
    loadGeneratedAsset('tile_cf_stone_wall', 'summer'),
    loadGeneratedAsset('tile_cf_hillside', 'summer'),
    loadGeneratedAsset('tile_cf_cellar_rack', 'summer'),
    loadGeneratedMap('estate'),
    loadGeneratedMap('cellar'),
  ]);
  const freshDevEstate = import.meta.env.DEV && new URLSearchParams(location.search).has('fresh');
  const farm = new FarmScene(input, {
    avatar: avatarAsset,
    seasons,
    press,
    barrel,
    worldTiles: { water, waterDetail, cellarFloor, cellarWall, hillside, cellarRack },
    maps: { estate: estateMap, cellar: cellarMap },
  }, freshDevEstate ? null : saveStore.load(), audio, (state) => saveStore.save(state));
  scenes.push(farm);

  const unlockAudio = (): void => {
    void audio.unlock().then(() => audio.playSfx('ui_confirm'));
  };
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  const saveNow = (): void => saveStore.save(farm.getState());
  window.addEventListener('beforeunload', saveNow);
  Object.assign(window, {
    __orchardDebug: {
      state: () => farm.getState(),
      audio: () => audio.getStatus(),
      save: saveNow,
      warp: (kind: 'day' | 'season') => farm.devWarp(kind),
      toggleLocation: () => farm.devToggleLocation(),
      setDayProgress: (progress: number) => farm.devSetDayProgress(progress),
      act: (action: Parameters<typeof farm.devDispatch>[0]) => farm.devDispatch(action),
      render: () => {
        gameContext.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        scenes.render(gameContext, 0);
      },
    },
  });

  const loop = new FixedStepLoop({
    update: () => scenes.update(),
    render: (alpha) => {
      gameContext.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
      scenes.render(gameContext, alpha);
    },
  });
  loop.start();
}

void start().catch((error: unknown) => {
  console.error(error);
  gameContext.fillStyle = '#101a14';
  gameContext.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
  gameContext.fillStyle = '#f3c677';
  gameContext.font = '8px monospace';
  gameContext.fillText('ASSET LOAD FAILED — RESTART npm run dev', 12, 20);
});
