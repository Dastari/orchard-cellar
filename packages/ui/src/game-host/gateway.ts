import type { LoadedAsset } from '../assets.js';
import type { UiRect } from '../geometry.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiGateway, type UiGatewayAction, type UiGatewayModel } from '../kit/components/gateway.js';
import { uiLoadingGateway, type UiLoadingGatewayModel } from '../kit/components/loading-gateway.js';
import { scrollUiElement } from '../kit/layout/scroll.js';
import { uiFixed } from '../kit/layout/box.js';
import { UiElement, type UiElementKey } from '../kit/runtime/element.js';
import { UiRoot } from '../kit/runtime/root.js';

export interface GameGatewayModel extends UiGatewayModel {
  /** Opaque account/connection generation only; never a token or authorization code. */
  readonly scopeKey: string;
  /** The client combines authBusy and navigationPending into busy. */
  readonly busy: boolean;
}
export interface GameGatewayCommands {
  readonly onAction: (action: UiGatewayAction, rawName?: string) => void;
  readonly onSelectProfile: (index: number) => void;
  readonly onNameChange?: (rawName: string) => void;
  readonly onDismissName?: () => void;
}
export interface GameGatewayArt { readonly emblem?: LoadedAsset; readonly version?: string }

/** Keep integer pixel type readable while compact gateways reflow within the safe viewport. */
export function gameGatewayLayout(width: number, height: number, maximumScale = 2) {
  const scale = Math.max(1, Math.min(maximumScale, Math.floor(Math.min(width / 480, height / 270))));
  const logicalWidth = Math.max(1, Math.floor(width / scale)), logicalHeight = Math.max(1, Math.floor(height / scale));
  const frameWidth = Math.max(0, Math.min(480, logicalWidth - 8)), frameHeight = Math.max(0, Math.min(300, logicalHeight - 8));
  return { scale, width: logicalWidth, height: logicalHeight, frame: {
    x: Math.floor((logicalWidth - frameWidth) / 2), y: Math.floor((logicalHeight - frameHeight) / 2), width: frameWidth, height: frameHeight,
  } };
}

function place(root: UiRoot, view: UiElement, frame: UiRect, width: number, height: number): void {
  const changed = root.viewport.width !== width || root.viewport.height !== height
    || view.rect.x !== frame.x || view.rect.y !== frame.y || view.rect.width !== frame.width || view.rect.height !== frame.height;
  root.resize(width, height);
  view.setStyle({ position: 'absolute', inset: { left: uiFixed(frame.x), top: uiFixed(frame.y) },
    width: uiFixed(Math.max(0, frame.width)), height: uiFixed(Math.max(0, frame.height)) });
  root.arrange();
  if (changed) revealFocus(root);
}

function revealFocus(root: UiRoot): void {
  // Reveal the same focused node after geometry changes without blur/refocus,
  // which would commit an in-flight native composition. Harmless updates do not scroll.
  let rect = root.focus.current?.rect;
  if (rect) {
    for (let parent = root.focus.current?.parent; parent; parent = parent.parent) {
      const bounds = parent.contentRect;
      const dx = rect.x < bounds.x ? rect.x - bounds.x : Math.max(0, rect.x + rect.width - bounds.x - bounds.width);
      const dy = rect.y < bounds.y ? rect.y - bounds.y : Math.max(0, rect.y + rect.height - bounds.y - bounds.height);
      const x = parent.scroll.x, y = parent.scroll.y;
      scrollUiElement(parent, x + dx, y + dy);
      rect = { ...rect, x: rect.x - (parent.scroll.x - x), y: rect.y - (parent.scroll.y - y) };
    }
    root.arrange();
  }
}

/** Account rendering and editing only. The client owns validation, persistence,
 * auth, URL cleanup, audio and navigation, including failed submissions. */
export class GameGateway {
  readonly root: UiRoot;
  private readonly view: ReturnType<typeof uiGateway>;
  private model: GameGatewayModel | null = null;
  private gestureKey = '';
  private disposed = false;
  constructor(art: UiKitArt, private readonly commands: GameGatewayCommands, private readonly decoration: GameGatewayArt = {}) {
    this.root = new UiRoot({ art, scale: 1, label: 'Account gateway' });
    this.view = uiGateway({ model: { localPreview: false, signedIn: false, profiles: [], selected: 0, message: '', busy: true },
      emblem: decoration.emblem, preserveNameOnNavigate: true,
      onAction: (action, name) => { if (this.active) commands.onAction(action, name); },
      onSelectProfile: index => { if (this.active) commands.onSelectProfile(index); },
      onNameChange: name => { if (this.active) commands.onNameChange?.(name); },
    });
    this.root.mount(new UiElement({ id: 'game.gateway.host', style: { display: 'stack', width: 'grow', height: 'grow' },
      children: [this.view], onKeyCapture: event => this.handleGlobalKeyDown(event) }));
    this.view.setStyle({ visible: false });
  }
  get editor() { return this.view.editor; }
  get active(): boolean { return this.model !== null && !this.disposed; }
  update(next: GameGatewayModel | null): void {
    if (this.disposed) return;
    // Development profiles must remain unavailable even if a stale model carries localPreview=true.
    const model = next ? { ...next, localPreview: next.localPreview && next.allowLocalPreview === true,
      allowPreviewToggle: next.allowLocalPreview === true && next.allowPreviewToggle === true } : null;
    const key = model ? JSON.stringify([model.scopeKey, model.localPreview, model.signedIn, model.profiles, model.selected, model.busy,
      model.allowLocalPreview, model.allowPreviewToggle]) : '';
    if (key !== this.gestureKey) { this.root.input.cancelPointers(); this.gestureKey = key; }
    if (model?.scopeKey !== this.model?.scopeKey || model?.localPreview !== this.model?.localPreview || !model) {
      this.root.focus.set(null); this.view.clearName();
      const resetScroll = (node: UiElement): void => { scrollUiElement(node, 0, 0); node.children.forEach(resetScroll); };
      resetScroll(this.view);
    }
    const contentChanged = model?.message !== this.model?.message || model?.error !== this.model?.error
      || model?.displayName !== this.model?.displayName;
    this.model = model;
    this.view.setStyle({ visible: !!model });
    if (model) this.view.updateGateway({ ...model, version: model.version ?? this.decoration.version });
    this.root.arrange();
    if (contentChanged) revealFocus(this.root);
  }
  /** Frame and viewport are game logical coordinates after the caller's safe-area transform. */
  setBounds(frame: UiRect, viewportWidth: number, viewportHeight: number): void {
    place(this.root, this.view, frame, viewportWidth, viewportHeight);
  }
  focusName(): void { if (this.active) { this.view.focusName(); this.root.arrange(); } }
  clearName(): void { this.view.clearName(); }
  /** Call before root.key for global canvas events. Native editor events reach the
   * same method through the retained capture hook; do not dispatch a handled key twice. */
  handleGlobalKeyDown(event: UiElementKey & { readonly isComposing?: boolean }): boolean {
    const model = this.model;
    if (!model || !this.active) return false;
    const key = event.key.toLowerCase(), editing = this.root.focus.current?.id === 'gateway.name';
    if (event.isComposing || this.editor.snapshot().composing) return event.key === 'Enter';
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const command = event.key === 'Enter' || event.key === 'Escape' || !editing && ['d', 'l', 'n', 'arrowup', 'arrowdown'].includes(key);
    if (model.busy) return command;
    if (event.repeat && ['Enter', ' ', 'Escape'].includes(event.key)) return true;
    if (key === 'd' && !editing && model.allowPreviewToggle && !event.repeat) { this.view.invokeAction('toggle-preview'); return true; }
    if (!model.localPreview) {
      if (key === 'l' && model.signedIn && !event.repeat) { this.view.invokeAction('sign-out'); return true; }
    } else {
      if (event.key === 'Escape') {
        this.view.clearName(); this.root.focus.set(null); this.commands.onDismissName?.(); return true;
      }
      if (!editing) {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { this.view.selectAdjacentProfile(event.key === 'ArrowUp' ? -1 : 1); this.root.arrange(); return true; }
        if (key === 'n' && !event.repeat) { this.focusName(); return true; }
      }
    }
    if (event.key === 'Enter') {
      // A focused action button owns Enter (e.g. Recover); an editor or unfocused canvas owns submit.
      if (this.root.focus.current?.kind === 'button' && !this.root.focus.current.id.startsWith('gateway.profile.')) return false;
      this.view.submit(); return true;
    }
    return false;
  }
  draw(context: CanvasRenderingContext2D): void { if (this.active) this.root.drawInContext(context); }
  dispose(): void { this.disposed = true; this.model = null; this.root.dispose(); }
}

/** Retained loading frame reused by account startup and the world's existing loop.
 * Backdrop, stage clock and renderer begin/end remain client responsibilities. */
export class GameGatewayLoading {
  readonly root: UiRoot;
  private readonly view: ReturnType<typeof uiLoadingGateway>;
  private visible = false;
  constructor(art: UiKitArt, decoration: GameGatewayArt = {}) {
    this.root = new UiRoot({ art, scale: 1, label: 'World loading' });
    this.view = uiLoadingGateway({ model: { title: '', detail: '', progress: 0 }, ...decoration });
    this.root.mount(this.view); this.view.setStyle({ visible: false });
  }
  update(model: UiLoadingGatewayModel | null): void {
    this.visible = model !== null; this.view.setStyle({ visible: this.visible });
    if (model) this.view.updateLoading(model);
    this.root.arrange();
  }
  setBounds(frame: UiRect, viewportWidth: number, viewportHeight: number): void { place(this.root, this.view, frame, viewportWidth, viewportHeight); }
  draw(context: CanvasRenderingContext2D): void { if (this.visible) this.root.drawInContext(context); }
  dispose(): void { this.visible = false; this.root.dispose(); }
}
