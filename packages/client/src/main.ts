import { InputController } from './input/input.js';
import { FixedStepLoop } from './loop.js';
import { loadGeneratedAsset } from './render/assets.js';
import { FarmScene } from './scenes/farm.js';
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
  const [avatarAsset, grassAsset, farmhouseAsset, fruitTreeAsset] = await Promise.all([
    loadGeneratedAsset('avatar_base', 'summer', {
      W: ['#8a5b3c', '#eab98f'],
      X: ['#2b1d0e', '#a97744'],
      Y: ['#6b2154', '#d4699b', '#3d1230'],
      Z: ['#2e2c33', '#6e6a75', '#141420'],
    }),
    loadGeneratedAsset('tile_grass'),
    loadGeneratedAsset('farmhouse'),
    loadGeneratedAsset('tree_apple_fruiting'),
  ]);
  scenes.push(new FarmScene(input, avatarAsset, grassAsset, farmhouseAsset, fruitTreeAsset));

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
