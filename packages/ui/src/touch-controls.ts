import type { UiPoint } from './geometry.js';
import { browserPrefersTouchControls, type TouchDirection, type TouchControlAction } from './touch-control-layout.js';
import { UiRoot } from './kit/runtime/root.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiElement } from './kit/runtime/element.js';
import { uiTouchControls } from './kit/components/touch-controls.js';
export * from './touch-control-layout.js';

/** Local input-modality adapter. The kit owns paint, capture and hit geometry. */
export class TouchControls {
  private enabled: boolean;
  private blocked = false;
  private movement: TouchDirection = 'idle';
  private movementPointer: number | null = null;
  private readonly capturedPointers = new Set<number>();
  private readonly root: UiRoot;
  private readonly controls: UiElement;
  private readonly ownsRoot: boolean;
  private dispatchingPointer = false;
  constructor(enabled = browserPrefersTouchControls(), art?: UiKitArt, root?: UiRoot,
    onKeyboardAction?: (action: Exclude<TouchControlAction, 'movement'>) => void) {
    this.enabled = enabled; this.ownsRoot = !root; this.root = root ?? new UiRoot({ art, scale: 1 });
    this.controls = this.root.mount(uiTouchControls({ id: 'hud.touch', placement: 'hud',
      onDirection: direction => { this.movement = direction; },
      onAction: action => { if (!this.dispatchingPointer) onKeyboardAction?.(action); },
      layout: { visible: this.visible },
    }));
  }
  get visible(): boolean { return this.enabled && !this.blocked; }
  get available(): boolean { return this.enabled; }
  get direction(): TouchDirection { return this.visible ? this.movement : 'idle'; }
  ownsPointer(pointerId: number): boolean { return this.capturedPointers.has(pointerId); }
  notePointerType(type: string): void {
    if (type === 'touch') this.enabled = true;
    else if ((type === 'mouse' || type === 'pen') && this.enabled) { this.enabled = false; this.reset(); }
    this.controls.setStyle({ visible: this.visible });
  }
  setBlocked(blocked: boolean): void {
    if (blocked === this.blocked) return;
    if (blocked) this.cancelGestures();
    this.blocked = blocked; this.controls.setStyle({ visible: this.visible });
  }
  private cancelGestures(): void {
    for (const pointer of this.capturedPointers) this.root.pointer({ type: 'cancel', point: { x: 0, y: 0 }, pointerId: -pointer - 1, button: 0 });
    this.movement = 'idle'; this.movementPointer = null;
  }
  reset(): void { this.cancelGestures(); this.capturedPointers.clear(); }
  pointerDown(point: UiPoint, pointerId: number, pointerType: string, width: number, height: number): TouchControlAction | null {
    this.notePointerType(pointerType); if (!this.visible) return null;
    this.root.resize(width,height); this.root.arrange();
    const hit = this.root.input.hits(point).find(node => node.hooks.onPointer || node.pointerMode === 'capture');
    if (!hit?.isDescendantOf(this.controls)) return null;
    const action = hit.props['touchAction'] as TouchControlAction | undefined;
    if (!action || this.capturedPointers.has(pointerId) || action === 'movement' && this.movementPointer !== null) return null;
    this.dispatchingPointer = true;
    try {
      if (!this.root.pointer({ type: 'down', point, pointerId: -pointerId - 1, button: 0 })) return null;
      this.capturedPointers.add(pointerId); if (action === 'movement') this.movementPointer = pointerId; return action;
    } finally { this.dispatchingPointer = false; }
  }
  pointerMove(point: UiPoint, pointerId: number, width: number, height: number): boolean {
    if (!this.ownsPointer(pointerId)) return false;
    if (this.visible) { this.root.resize(width,height); this.root.pointer({ type: 'move', point, pointerId: -pointerId - 1, button: 0 }); }
    return true;
  }
  pointerUp(pointerId: number): boolean {
    if (!this.capturedPointers.delete(pointerId)) return false;
    if (this.movementPointer === pointerId) this.movementPointer = null;
    this.root.pointer({ type: 'up', point: { x: 0, y: 0 }, pointerId: -pointerId - 1, button: 0 }); return true;
  }
  pointerCancel(pointerId: number): boolean {
    if (!this.capturedPointers.delete(pointerId)) return false;
    if (this.movementPointer === pointerId) this.movementPointer = null;
    this.root.pointer({ type: 'cancel', point: { x: 0, y: 0 }, pointerId: -pointerId - 1, button: 0 }); return true;
  }
  draw(context: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.ownsRoot || !this.visible) return;
    this.root.resize(width,height); this.root.drawInContext(context);
  }
  dispose(): void { this.reset(); this.controls.dispose(); if (this.ownsRoot) this.root.dispose(); }
}
