import type { UiKitArt } from './kit/components/art.js';
import { uiTouchControls } from './kit/components/touch-controls.js';
import { UiRoot } from './kit/runtime/root.js';
import { browserPrefersTouchControls, DEFAULT_TOUCH_CONTROL_PREFERENCES, normalizeTouchControlPreferences,
  type TouchControlPreferences, type TouchControlAction, type TouchDirection } from './touch-control-layout.js';
export * from './touch-control-layout.js';

/** Production uses the shared composition and one multi-pointer gesture model.
 * The client owns DOM capture, action transport, defense polling and its frame loop. */
export class TouchControls {
  readonly root: UiRoot;
  private readonly view: ReturnType<typeof uiTouchControls>;
  private enabled: boolean;
  private blocked = false;
  private preferences = DEFAULT_TOUCH_CONTROL_PREFERENCES;
  private width = 0;
  private height = 0;
  constructor(art: UiKitArt, onAction: (action: Exclude<TouchControlAction, 'movement'>) => void,
    enabled = browserPrefersTouchControls()) {
    this.enabled = enabled;
    this.root = new UiRoot({ art, scale: 1, label: 'Touch controls' });
    this.view = uiTouchControls({ id: 'game.touch-controls', placement: 'hud', keyboard: false,
      preferences: this.preferences, onAction: action => { if (this.visible) onAction(action); } });
    this.root.mount(this.view); this.view.setStyle({ visible: this.visible });
  }
  get visible(): boolean { return this.enabled && !this.blocked; }
  get available(): boolean { return this.enabled; }
  get direction(): TouchDirection { return this.visible ? this.view.direction : 'idle'; }
  get blockHeld(): boolean { return this.visible && this.view.isHeld('block'); }
  setPreferences(preferences: TouchControlPreferences): void {
    const next = normalizeTouchControlPreferences(preferences);
    if (next.swapped === this.preferences.swapped && next.bottomOffset === this.preferences.bottomOffset) return;
    this.reset(); this.preferences = next; this.view.setPreferences(next); this.root.arrange();
  }
  setBlocked(blocked: boolean): void {
    if (blocked === this.blocked) return;
    this.blocked = blocked; if (blocked) this.reset(); this.view.setStyle({ visible: this.visible }); this.root.arrange();
  }
  notePointerType(pointerType: string): void {
    if (!['touch', 'mouse', 'pen'].includes(pointerType)) return;
    const enabled = pointerType === 'touch'; if (enabled === this.enabled) return;
    this.enabled = enabled; if (!enabled) this.reset(); this.view.setStyle({ visible: this.visible }); this.root.arrange();
  }
  setBounds(width: number, height: number): void {
    if (this.width !== width || this.height !== height) { this.reset(); this.width = width; this.height = height; }
    this.root.resize(width, height); this.root.arrange();
  }
  reset(): void { this.root.input.cancelPointers(); this.root.focus.set(null); this.view.reset(); }
  draw(context: CanvasRenderingContext2D): void { if (this.visible) this.root.drawInContext(context); }
  dispose(): void { this.reset(); this.enabled = false; this.root.dispose(); }
}
