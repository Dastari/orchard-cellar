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

export type TouchControlAction = 'movement' | 'interact' | 'secondary' | 'jump' | 'dodge' | 'block';

export interface TouchControlPreferences {
  readonly swapped: boolean;
  /** Additional clearance in logical UI pixels, independent of device DPR. */
  readonly bottomOffset: number;
}

export const MAX_TOUCH_BOTTOM_OFFSET = 120;
export const DEFAULT_TOUCH_CONTROL_PREFERENCES: TouchControlPreferences = { swapped: false, bottomOffset: 0 };

export function normalizeTouchControlPreferences(value: Partial<TouchControlPreferences>): TouchControlPreferences {
  return {
    swapped: value.swapped === true,
    bottomOffset: Number.isFinite(value.bottomOffset)
      ? Math.round(Math.max(0, Math.min(MAX_TOUCH_BOTTOM_OFFSET, value.bottomOffset!))) : 0,
  };
}

export interface TouchControlLayout {
  readonly joystickCenter: UiPoint;
  readonly joystickRadius: number;
  readonly interactButton: UiRect;
  readonly secondaryButton: UiRect;
  readonly jumpButton: UiRect;
  readonly dodgeButton: UiRect;
  readonly blockButton: UiRect;
}

const JOYSTICK_RADIUS = 30;
const JOYSTICK_DEAD_ZONE = 8;
const BUTTON_WIDTH = 38;
const BUTTON_HEIGHT = 30;

/** Dense landscape layouts share a reserved bottom bar and top chrome strip. */
export function touchControlsUseCompactLayout(width: number, height: number): boolean {
  // A full status row, readable tracker and top chrome need 295px. Below
  // 382px wide the two 96px status panels stack and need another 60px.
  return height < (width < 382 ? 355 : 295) || (width < 640 && height < 330);
}

/**
 * Keep the controls clear of the centred hotbar on narrow/portrait screens.
 * On landscape screens they sit in the otherwise-unused thumb corners.
 */
export function touchControlLayout(
  width: number, height: number,
  preferences: TouchControlPreferences = DEFAULT_TOUCH_CONTROL_PREFERENCES,
): TouchControlLayout {
  if (touchControlsUseCompactLayout(width, height)) {
    const { swapped, bottomOffset } = normalizeTouchControlPreferences(preferences);
    const hotbarHeight = width >= 306 ? 31 : 64;
    const bottom = height - 6 - hotbarHeight - 4;
    const top = 40;
    // The joystick's capture radius is eight pixels larger than its artwork.
    // Preserve the saved preference, but fit its applied offset between chrome.
    const bankHeight = BUTTON_HEIGHT * 2 + 37;
    const offset = Math.min(bottomOffset, Math.max(0, bottom - bankHeight - top));
    const end = bottom - offset;
    const right = width - 10;
    const mirror = (rect: UiRect): UiRect => ({ ...rect, x: swapped ? width - rect.x - rect.width : rect.x });
    return {
      joystickCenter: { x: swapped ? width - 42 : 42, y: end - JOYSTICK_RADIUS - 8 },
      joystickRadius: JOYSTICK_RADIUS,
      interactButton: mirror({ x: right - 38, y: end - 30, width: 38, height: 30 }),
      dodgeButton: mirror({ x: right - 84, y: end - 30, width: 38, height: 30 }),
      jumpButton: mirror({ x: right - 38, y: end - 63, width: 38, height: 30 }),
      secondaryButton: mirror({ x: right - 84, y: end - 63, width: 38, height: 30 }),
      blockButton: mirror({ x: right - 38, y: end - 97, width: 38, height: 30 }),
    };
  }
  const portrait = height > width;
  const bottomClearance = portrait ? 44 : 10;
  const { swapped, bottomOffset } = normalizeTouchControlPreferences(preferences);
  const centerY = Math.max(JOYSTICK_RADIUS + 8, Math.min(
    height - bottomClearance - JOYSTICK_RADIUS,
    swapped ? height - 70 : height,
  ));
  const desiredButtonCenterY = portrait
    ? Math.min(height - BUTTON_HEIGHT / 2 - 2, centerY + 8)
    : centerY;
  // The bottom-right mobile purse/inventory button occupies the final 32 UI
  // pixels. Keep E immediately above it instead of allowing the hit targets to
  // overlap, while leaving the joystick itself at its established position.
  const buttonCenterY = Math.min(desiredButtonCenterY, height - 47);
  const right = Math.max(BUTTON_WIDTH + 8, width - 10);
  const offset = Math.min(bottomOffset, Math.max(0, Math.min(centerY - 38, buttonCenterY - (BUTTON_HEIGHT * 2 + 22) - 100)));
  const mirror = (rect: UiRect): UiRect => ({
    ...rect, x: swapped ? width - rect.x - rect.width : rect.x, y: rect.y - offset,
  });
  const joystickX = swapped ? width - JOYSTICK_RADIUS - 12 : JOYSTICK_RADIUS + 12;
  const captureRadius = JOYSTICK_RADIUS + 8;
  const barWidth = width >= 306 ? 298 : 148, barHeight = width >= 306 ? 31 : 64;
  const barX = Math.max(4, Math.floor((width - barWidth) / 2));
  const intersectsBarColumns = joystickX + captureRadius > barX && joystickX - captureRadius < barX + barWidth;
  const joystickY = intersectsBarColumns ? Math.min(centerY - offset, height - 6 - barHeight - 4 - captureRadius) : centerY - offset;
  return {
    joystickCenter: { x: joystickX, y: joystickY },
    joystickRadius: JOYSTICK_RADIUS,
    interactButton: mirror({
      x: right - BUTTON_WIDTH,
      y: buttonCenterY - BUTTON_HEIGHT / 2,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
    }),
    secondaryButton: mirror({
      x: right - BUTTON_WIDTH * 2 - 8,
      y: buttonCenterY - BUTTON_HEIGHT - 18,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
    }),
    dodgeButton: mirror({x: right-BUTTON_WIDTH*2-8, y: buttonCenterY-BUTTON_HEIGHT/2, width:BUTTON_WIDTH, height:BUTTON_HEIGHT}),
    blockButton: mirror({x: right-BUTTON_WIDTH, y: buttonCenterY-BUTTON_HEIGHT*2-22, width:BUTTON_WIDTH, height:BUTTON_HEIGHT}),
    jumpButton: mirror({
      x: right - BUTTON_WIDTH,
      y: buttonCenterY - BUTTON_HEIGHT - 18,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
    }),
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
