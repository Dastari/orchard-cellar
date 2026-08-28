import { describe, expect, it } from 'vitest';
import {
  TouchControls,
  touchControlLayout,
  touchDirectionFromDelta,
} from './touch-controls.js';

describe('touch controls', () => {
  it('maps a thumb vector onto all eight movement directions', () => {
    expect(touchDirectionFromDelta(0, 0)).toBe('idle');
    expect(touchDirectionFromDelta(20, 0)).toBe('right');
    expect(touchDirectionFromDelta(-20, 0)).toBe('left');
    expect(touchDirectionFromDelta(0, -20)).toBe('up');
    expect(touchDirectionFromDelta(0, 20)).toBe('down');
    expect(touchDirectionFromDelta(20, -20)).toBe('upRight');
    expect(touchDirectionFromDelta(-20, -20)).toBe('upLeft');
    expect(touchDirectionFromDelta(20, 20)).toBe('downRight');
    expect(touchDirectionFromDelta(-20, 20)).toBe('downLeft');
  });

  it('keeps controls inside both portrait and landscape viewports', () => {
    for (const [width, height] of [[390, 844], [844, 390]] as const) {
      const layout = touchControlLayout(width, height);
      expect(layout.joystickCenter.x - layout.joystickRadius).toBeGreaterThanOrEqual(0);
      expect(layout.joystickCenter.y - layout.joystickRadius).toBeGreaterThanOrEqual(0);
      expect(layout.joystickCenter.y + layout.joystickRadius).toBeLessThanOrEqual(height);
      expect(layout.interactButton.x + layout.interactButton.width).toBeLessThanOrEqual(width);
      expect(layout.secondaryButton.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps portrait controls lower than the previous hotbar-clearance position', () => {
    const layout = touchControlLayout(390, 844);
    expect(layout.joystickCenter.y).toBe(770);
    expect(layout.interactButton.y + layout.interactButton.height).toBe(793);
  });

  it('retains the landscape joystick position while reserving the purse row', () => {
    const layout = touchControlLayout(844, 390);
    expect(layout.joystickCenter.y).toBe(350);
    expect(layout.interactButton).toMatchObject({ y: 328, height: 30 });
  });

  it('supports moving and pressing an action with separate touches', () => {
    const width = 844;
    const height = 390;
    const layout = touchControlLayout(width, height);
    const controls = new TouchControls(true);

    expect(controls.pointerDown(layout.joystickCenter, 1, 'touch', width, height)).toBe('movement');
    expect(controls.ownsPointer(1)).toBe(true);
    expect(controls.pointerMove({
      x: layout.joystickCenter.x + 30,
      y: layout.joystickCenter.y - 30,
    }, 1, width, height)).toBe(true);
    expect(controls.direction).toBe('upRight');

    expect(controls.pointerDown({
      x: layout.interactButton.x + 2,
      y: layout.interactButton.y + 2,
    }, 2, 'touch', width, height)).toBe('interact');
    expect(controls.direction).toBe('upRight');
    expect(controls.pointerUp(2)).toBe(true);
    expect(controls.direction).toBe('upRight');
    expect(controls.pointerUp(1)).toBe(true);
    expect(controls.ownsPointer(1)).toBe(false);
    expect(controls.direction).toBe('idle');
  });

  it('keeps a captured thumb moving below the canvas boundary', () => {
    const width = 390;
    const height = 844;
    const layout = touchControlLayout(width, height);
    const controls = new TouchControls(true);

    controls.pointerDown(layout.joystickCenter, 1, 'touch', width, height);
    expect(controls.pointerMove({
      x: layout.joystickCenter.x,
      y: height + 20,
    }, 1, width, height)).toBe(true);
    expect(controls.direction).toBe('down');
  });

  it('releases movement whenever controls are blocked by a modal', () => {
    const width = 844;
    const height = 390;
    const layout = touchControlLayout(width, height);
    const controls = new TouchControls(true);
    controls.pointerDown(layout.joystickCenter, 1, 'touch', width, height);
    controls.pointerMove({ x: layout.joystickCenter.x + 30, y: layout.joystickCenter.y }, 1, width, height);
    expect(controls.direction).toBe('right');
    controls.setBlocked(true);
    expect(controls.direction).toBe('idle');
    expect(controls.visible).toBe(false);
  });

  it('keeps an action pointer claimed until release when that action opens a modal', () => {
    const width = 844;
    const height = 390;
    const layout = touchControlLayout(width, height);
    const controls = new TouchControls(true);
    controls.pointerDown({
      x: layout.interactButton.x + 2,
      y: layout.interactButton.y + 2,
    }, 7, 'touch', width, height);
    controls.setBlocked(true);
    expect(controls.pointerMove({ x: 400, y: 200 }, 7, width, height)).toBe(true);
    expect(controls.pointerUp(7)).toBe(true);
    expect(controls.pointerUp(7)).toBe(false);
  });
});
