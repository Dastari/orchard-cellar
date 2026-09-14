import type { UiPoint, UiRect } from './geometry.js';

export type TouchDirection =
  | 'idle'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'upLeft'
  | 'upRight'
  | 'downLeft'
  | 'downRight';

export type TouchControlAction = 'movement' | 'interact' | 'secondary' | 'jump';

export interface TouchControlLayout {
  readonly joystickCenter: UiPoint;
  readonly joystickRadius: number;
  readonly interactButton: UiRect;
  readonly secondaryButton: UiRect;
  readonly jumpButton: UiRect;
}

const JOYSTICK_RADIUS = 30;
const JOYSTICK_DEAD_ZONE = 8;
const BUTTON_WIDTH = 38;
const BUTTON_HEIGHT = 30;

/**
 * Keep the controls clear of the centred hotbar on narrow/portrait screens.
 * On landscape screens they sit in the otherwise-unused thumb corners.
 */
export function touchControlLayout(width: number, height: number): TouchControlLayout {
  const portrait = height > width;
  const radius = width < 360 ? 24 : JOYSTICK_RADIUS;
  const bottomClearance = portrait ? 44 : 10;
  const centerY = Math.max(radius + 8, height - bottomClearance - radius);
  const desiredButtonCenterY = portrait
    ? Math.min(height - BUTTON_HEIGHT / 2 - 2, centerY + 8)
    : centerY;
  // The bottom-right mobile purse/inventory button occupies the final 32 UI
  // pixels. Keep E immediately above it instead of allowing the hit targets to
  // overlap, while leaving the joystick itself at its established position.
  const buttonCenterY = Math.min(desiredButtonCenterY, height - 47);
  const right = Math.max(BUTTON_WIDTH + 8, width - 10);
  return {
    joystickCenter: { x: radius + (width < 360 ? 6 : 12), y: centerY },
    joystickRadius: radius,
    interactButton: {
      x: right - BUTTON_WIDTH,
      y: buttonCenterY - BUTTON_HEIGHT / 2,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
    },
    secondaryButton: {
      x: right - BUTTON_WIDTH * 2 - 8,
      y: buttonCenterY - BUTTON_HEIGHT - 18,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
    },
    jumpButton: {
      x: right - BUTTON_WIDTH,
      y: buttonCenterY - BUTTON_HEIGHT - 18,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
    },
  };
}

export function touchDirectionFromDelta(
  deltaX: number,
  deltaY: number,
  deadZone = JOYSTICK_DEAD_ZONE,
): TouchDirection {
  const magnitude = Math.hypot(deltaX, deltaY);
  if (magnitude < deadZone) return 'idle';
  const angle = Math.atan2(deltaY, deltaX);
  const octant = Math.round(angle / (Math.PI / 4));
  switch (octant) {
    case -4:
    case 4: return 'left';
    case -3: return 'upLeft';
    case -2: return 'up';
    case -1: return 'upRight';
    case 0: return 'right';
    case 1: return 'downRight';
    case 2: return 'down';
    case 3: return 'downLeft';
    default: return 'idle';
  }
}

export function prefersTouchControls(
  maximumTouchPoints: number,
  coarsePrimaryPointer: boolean,
  finePrimaryPointer: boolean,
): boolean {
  if (coarsePrimaryPointer) return true;
  if (finePrimaryPointer) return false;
  return maximumTouchPoints > 0;
}

export function browserPrefersTouchControls(): boolean {
  const maximumTouchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints;
  const coarsePrimaryPointer = typeof matchMedia === 'function'
    && matchMedia('(pointer: coarse)').matches;
  const finePrimaryPointer = typeof matchMedia === 'function'
    && matchMedia('(pointer: fine)').matches;
  return prefersTouchControls(maximumTouchPoints, coarsePrimaryPointer, finePrimaryPointer);
}

