import type { Direction } from '@orchard/sim';

const MOVEMENT_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
]);

export function directionFromAxes(horizontal: number, vertical: number): Direction | null {
  const x = horizontal < -0.35 ? -1 : horizontal > 0.35 ? 1 : 0;
  const y = vertical < -0.35 ? -1 : vertical > 0.35 ? 1 : 0;
  if (x === 0 && y === 0) return null;
  if (x === -1 && y === -1) return 'upLeft';
  if (x === 1 && y === -1) return 'upRight';
  if (x === -1 && y === 1) return 'downLeft';
  if (x === 1 && y === 1) return 'downRight';
  if (x === -1) return 'left';
  if (x === 1) return 'right';
  return y === -1 ? 'up' : 'down';
}

export function axesFromCodes(codes: ReadonlySet<string>): readonly [number, number] {
  const left = codes.has('ArrowLeft') || codes.has('KeyA');
  const right = codes.has('ArrowRight') || codes.has('KeyD');
  const up = codes.has('ArrowUp') || codes.has('KeyW');
  const down = codes.has('ArrowDown') || codes.has('KeyS');
  return [Number(right) - Number(left), Number(down) - Number(up)];
}

export class InputController {
  private readonly keys = new Set<string>();
  private touchAxes: readonly [number, number] = [0, 0];

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointer);
    canvas.addEventListener('pointermove', this.onPointer);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  getDirection(): Direction | null {
    const keyboard = axesFromCodes(this.keys);
    const gamepad = navigator.getGamepads?.()[0];
    const gamepadAxes: readonly [number, number] = gamepad
      ? [gamepad.axes[0] ?? 0, gamepad.axes[1] ?? 0]
      : [0, 0];
    const horizontal = keyboard[0] || gamepadAxes[0] || this.touchAxes[0];
    const vertical = keyboard[1] || gamepadAxes[1] || this.touchAxes[1];
    return directionFromAxes(horizontal, vertical);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.canvas.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!MOVEMENT_CODES.has(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onPointer = (event: PointerEvent): void => {
    if (event.buttons === 0) return;
    const bounds = this.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    this.touchAxes = [x * 2, y * 2];
  };

  private readonly onPointerUp = (): void => {
    this.touchAxes = [0, 0];
  };
}

