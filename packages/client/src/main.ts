import { InputController } from './input/input.js';
import { FixedStepLoop } from './loop.js';
import { loadAtlasMetadata } from './render/sprite.js';
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

const input = new InputController(gameCanvas);
const scenes = new SceneStack();
const avatarMetadata = await loadAtlasMetadata('/placeholder-atlas.json');
scenes.push(new FarmScene(input, avatarMetadata));

const loop = new FixedStepLoop({
  update: () => scenes.update(),
  render: (alpha) => {
    gameContext.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    scenes.render(gameContext, alpha);
  },
});
loop.start();
