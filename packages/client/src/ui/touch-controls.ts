import type { PixelUi } from '../render/pixel-ui.js';
import { drawPixelText } from '../render/pixel-ui.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

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

export type TouchControlAction = 'movement' | 'interact' | 'secondary';

export interface TouchControlLayout {
  readonly joystickCenter: UiPoint;
  readonly joystickRadius: number;
  readonly interactButton: UiRect;
  readonly secondaryButton: UiRect;
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
  const bottomClearance = portrait ? 44 : 10;
  const centerY = Math.max(JOYSTICK_RADIUS + 8, height - bottomClearance - JOYSTICK_RADIUS);
  const desiredButtonCenterY = portrait
    ? Math.min(height - BUTTON_HEIGHT / 2 - 2, centerY + 8)
    : centerY;
  // The bottom-right mobile purse/inventory button occupies the final 32 UI
  // pixels. Keep E immediately above it instead of allowing the hit targets to
  // overlap, while leaving the joystick itself at its established position.
  const buttonCenterY = Math.min(desiredButtonCenterY, height - 47);
  const right = Math.max(BUTTON_WIDTH + 8, width - 10);
  return {
    joystickCenter: { x: JOYSTICK_RADIUS + 12, y: centerY },
    joystickRadius: JOYSTICK_RADIUS,
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

export function browserPrefersTouchControls(): boolean {
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

function pointInJoystick(point: UiPoint, layout: TouchControlLayout): boolean {
  return Math.hypot(
    point.x - layout.joystickCenter.x,
    point.y - layout.joystickCenter.y,
  ) <= layout.joystickRadius + 8;
}

function steppedCirclePath(
  context: CanvasRenderingContext2D,
  center: UiPoint,
  radius: number,
): void {
  const inset = Math.round(radius * 0.34);
  context.beginPath();
  context.moveTo(center.x - radius + inset, center.y - radius);
  context.lineTo(center.x + radius - inset, center.y - radius);
  context.lineTo(center.x + radius, center.y - radius + inset);
  context.lineTo(center.x + radius, center.y + radius - inset);
  context.lineTo(center.x + radius - inset, center.y + radius);
  context.lineTo(center.x - radius + inset, center.y + radius);
  context.lineTo(center.x - radius, center.y + radius - inset);
  context.lineTo(center.x - radius, center.y - radius + inset);
  context.closePath();
}

/** Canvas-native, multi-pointer mobile controls. */
export class TouchControls {
  private enabled: boolean;
  private blocked = false;
  private movementPointerId: number | null = null;
  private movementPoint: UiPoint | null = null;
  private pressedActions = new Map<number, Exclude<TouchControlAction, 'movement'>>();
  private capturedPointers = new Set<number>();

  constructor(enabled = browserPrefersTouchControls()) {
    this.enabled = enabled;
  }

  get visible(): boolean {
    return this.enabled && !this.blocked;
  }

  get available(): boolean {
    return this.enabled;
  }

  ownsPointer(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }

  get direction(): TouchDirection {
    if (!this.visible || this.movementPoint === null) return 'idle';
    return touchDirectionFromDelta(this.movementPoint.x, this.movementPoint.y);
  }

  notePointerType(pointerType: string): void {
    if (pointerType === 'touch') this.enabled = true;
  }

  setBlocked(blocked: boolean): void {
    if (blocked === this.blocked) return;
    this.blocked = blocked;
    if (blocked) {
      this.movementPointerId = null;
      this.movementPoint = null;
      this.pressedActions.clear();
    }
  }

  reset(): void {
    this.movementPointerId = null;
    this.movementPoint = null;
    this.pressedActions.clear();
    this.capturedPointers.clear();
  }

  pointerDown(
    point: UiPoint,
    pointerId: number,
    pointerType: string,
    width: number,
    height: number,
  ): TouchControlAction | null {
    this.notePointerType(pointerType);
    if (!this.visible) return null;
    const layout = touchControlLayout(width, height);
    if (this.movementPointerId === null && pointInJoystick(point, layout)) {
      this.movementPointerId = pointerId;
      this.updateMovementPoint(point, layout);
      this.capturedPointers.add(pointerId);
      return 'movement';
    }
    if (containsPoint(layout.interactButton, point)) {
      this.pressedActions.set(pointerId, 'interact');
      this.capturedPointers.add(pointerId);
      return 'interact';
    }
    if (containsPoint(layout.secondaryButton, point)) {
      this.pressedActions.set(pointerId, 'secondary');
      this.capturedPointers.add(pointerId);
      return 'secondary';
    }
    return null;
  }

  pointerMove(point: UiPoint, pointerId: number, width: number, height: number): boolean {
    if (!this.capturedPointers.has(pointerId)) return false;
    if (!this.visible || pointerId !== this.movementPointerId) return true;
    this.updateMovementPoint(point, touchControlLayout(width, height));
    return true;
  }

  pointerUp(pointerId: number): boolean {
    const captured = this.capturedPointers.delete(pointerId);
    if (pointerId === this.movementPointerId) {
      this.movementPointerId = null;
      this.movementPoint = null;
    }
    this.pressedActions.delete(pointerId);
    return captured;
  }

  pointerCancel(pointerId: number): boolean {
    return this.pointerUp(pointerId);
  }

  draw(
    context: CanvasRenderingContext2D,
    ui: PixelUi,
    skin: UiSkin,
    width: number,
    height: number,
  ): void {
    if (!this.visible) return;
    const layout = touchControlLayout(width, height);
    const movement = this.movementPoint ?? { x: 0, y: 0 };
    const magnitude = Math.hypot(movement.x, movement.y);
    const maximumKnobTravel = layout.joystickRadius - 11;
    const knobScale = magnitude <= maximumKnobTravel ? 1 : maximumKnobTravel / magnitude;
    const knob = {
      x: layout.joystickCenter.x + movement.x * knobScale,
      y: layout.joystickCenter.y + movement.y * knobScale,
    };

    context.save();
    context.globalAlpha *= 0.78;
    context.imageSmoothingEnabled = false;
    steppedCirclePath(context, layout.joystickCenter, layout.joystickRadius + 2);
    context.fillStyle = '#3a2030';
    context.fill();
    steppedCirclePath(context, layout.joystickCenter, layout.joystickRadius);
    context.fillStyle = '#e8ad78';
    context.fill();
    steppedCirclePath(context, layout.joystickCenter, layout.joystickRadius - 5);
    context.fillStyle = '#82513e';
    context.fill();
    steppedCirclePath(context, knob, 10);
    context.fillStyle = '#63a857';
    context.fill();

    const interactPressed = [...this.pressedActions.values()].includes('interact');
    const secondaryPressed = [...this.pressedActions.values()].includes('secondary');
    drawUiSkinAsset(
      context,
      skin.buttonConfirm,
      layout.interactButton,
      interactPressed ? 'pressed' : 'idle',
    );
    drawUiSkinAsset(
      context,
      skin.button,
      layout.secondaryButton,
      secondaryPressed ? 'pressed' : 'idle',
    );
    context.globalAlpha = 1;
    drawPixelText(
      context,
      ui,
      'E',
      layout.interactButton.x + layout.interactButton.width / 2,
      layout.interactButton.y + 7,
      { align: 'center', scale: 2, color: '#fff4cf' },
    );
    drawPixelText(
      context,
      ui,
      'F',
      layout.secondaryButton.x + layout.secondaryButton.width / 2,
      layout.secondaryButton.y + 7,
      { align: 'center', scale: 2, color: '#5c3427' },
    );
    context.restore();
  }

  private updateMovementPoint(point: UiPoint, layout: TouchControlLayout): void {
    this.movementPoint = {
      x: point.x - layout.joystickCenter.x,
      y: point.y - layout.joystickCenter.y,
    };
  }
}
