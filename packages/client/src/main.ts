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
  const avatarAsset = await loadGeneratedAsset('avatar_base', 'summer', {
    W: ['#8a5b3c', '#eab98f'],
    X: ['#2b1d0e', '#a97744'],
    Y: ['#6b2154', '#d4699b', '#3d1230'],
    Z: ['#2e2c33', '#6e6a75', '#141420'],
  });
  const seasonEntries = await Promise.all(SEASONS.map(async (season) => {
    const [grass, path, soil, farmhouse, treeSapling, treeYoung, treeMature, fruitTree] = await Promise.all([
      loadGeneratedAsset('tile_grass', season),
      loadGeneratedAsset('tile_path', season),
      loadGeneratedAsset('tile_soil', season),
      loadGeneratedAsset('farmhouse', season),
      loadGeneratedAsset('tree_apple_sapling', season),
      loadGeneratedAsset('tree_apple_young', season),
      loadGeneratedAsset('tree_apple_mature', season),
      loadGeneratedAsset('tree_apple_fruiting', season),
    ]);
    const assets: SeasonalFarmAssets = { grass, path, soil, farmhouse, treeSapling, treeYoung, treeMature, fruitTree };
    return [season, assets] as const;
  }));
  const seasons = Object.fromEntries(seasonEntries) as Record<Season, SeasonalFarmAssets>;
  const [press, barrel, estateMap, cellarMap] = await Promise.all([
    loadGeneratedAsset('prop_basket_press', 'summer'),
    loadGeneratedAsset('prop_oak_barrel', 'summer'),
    loadGeneratedMap('estate'),
    loadGeneratedMap('cellar'),
  ]);
  const freshDevEstate = import.meta.env.DEV && new URLSearchParams(location.search).has('fresh');
  const farm = new FarmScene(input, {
    avatar: avatarAsset,
    seasons,
    press,
    barrel,
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
