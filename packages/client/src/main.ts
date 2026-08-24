import { SIM_TICKS_PER_SECOND } from '@orchard/sim';
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

function renderShell(): void {
  gameContext.fillStyle = '#18261f';
  gameContext.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
  gameContext.fillStyle = '#345e3f';
  gameContext.fillRect(24, 24, VIRTUAL_WIDTH - 48, VIRTUAL_HEIGHT - 48);
  gameContext.fillStyle = '#d7b36a';
  gameContext.fillRect(40, 40, VIRTUAL_WIDTH - 80, VIRTUAL_HEIGHT - 80);
  gameContext.fillStyle = '#5b3429';
  gameContext.font = 'bold 20px monospace';
  gameContext.textAlign = 'center';
  gameContext.fillText('ORCHARD & CELLAR', VIRTUAL_WIDTH / 2, 124);
  gameContext.font = '10px monospace';
  gameContext.fillText(`${SIM_TICKS_PER_SECOND} Hz deterministic simulation`, VIRTUAL_WIDTH / 2, 148);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
renderShell();
