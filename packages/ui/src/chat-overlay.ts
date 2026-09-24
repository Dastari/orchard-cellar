import type { UiPoint, UiRect } from './geometry.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiChat, type UiChatElement, type UiChatLine } from './kit/components/chat.js';
import { UiRoot } from './kit/runtime/root.js';
import { CanvasTextEditor } from './kit/runtime/text-editor.js';
import { uiFixed } from './kit/layout/box.js';
import { chatCommandSuggestions } from './chat-command.js';
import { touchControlLayout } from './touch-controls.js';

export const CHAT_FADE_DELAY_MS = 8_000;
export const CHAT_FADE_DURATION_MS = 4_000;
export const CHAT_HOVER_SHADE_ALPHA = 0.28;
const CHAT_LINE_HEIGHT = 9;
const CHAT_VISIBLE_LINES = 7;
const CHAT_FRAME_CONTENT_PADDING = 2;
const CHAT_INPUT_HEIGHT = 22;
const CHAT_TOGGLE_SIZE = 22;
const CHAT_POSITION_STORAGE_KEY = 'orchard:chat-anchor';
const CHAT_COLLAPSED_STORAGE_KEY = 'orchard:chat-collapsed';

export interface ChatOverlayMessage {
  readonly id: bigint;
  readonly channelName: string;
  readonly senderDisplayName: string;
  readonly kind: string;
  readonly body: string;
  /** Reserved structured data for item-link spans rendered as interactive segments later. */
  readonly itemLinksJson: string;
}

export interface ChatOverlayModel {
  readonly sessionKey: string;
  readonly width: number;
  readonly height: number;
  readonly connected: boolean;
  readonly canAdministerWorld: boolean;
  readonly onlinePlayerNames: readonly string[];
  readonly replyPlayerName: string | null;
  readonly messages: readonly ChatOverlayMessage[];
  readonly touchControls?: boolean;
  /** Logical UI pixels covered by a software keyboard at the viewport bottom. */
  readonly keyboardInset?: number;
  /** A visually higher modal owns pointer interaction for this frame. */
  readonly interactionBlocked?: boolean;
}

export interface ChatOverlayLayout {
  readonly history: UiRect;
  readonly input: UiRect;
  readonly toggle: UiRect;
  readonly visibleLines: number;
}

export function chatLineAlpha(ageMs: number, expanded: boolean): number {
  if (expanded || ageMs <= CHAT_FADE_DELAY_MS) return 1;
  return Math.max(0, 1 - (ageMs - CHAT_FADE_DELAY_MS) / CHAT_FADE_DURATION_MS);
}

export function chatHistoryExpanded(touchControls: boolean, open: boolean, hovered: boolean): boolean {
  // Touch browsers can retain a synthetic hover after a tap. Touch capability
  // must not pin chat history forever: only active text entry does that.
  return open || (!touchControls && hovered);
}

export function chatToggleTooltipText(hovered: boolean, touchControls: boolean): string | null {
  return hovered && !touchControls ? 'CHAT' : null;
}

export function storedChatCollapsed(value: string | null): boolean {
  return value === 'true';
}

export function wrapChatText(text: string, maximumCharacters: number): readonly string[] {
  const width = Math.max(1, Math.floor(maximumCharacters));
  if (text.length <= width) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > width) {
    const candidate = remaining.slice(0, width + 1);
    const breakAt = candidate.lastIndexOf(' ');
    const split = breakAt > 0 ? breakAt : width;
    lines.push(remaining.slice(0, split));
    remaining = remaining.slice(split).trimStart();
  }
  if (remaining.length > 0) lines.push(remaining);
  return lines;
}

export function chatMessagePresentation(message: Pick<ChatOverlayMessage, 'channelName' | 'senderDisplayName' | 'kind' | 'body'>): {
  readonly text: string;
  readonly color: string;
} {
  if (message.kind === 'motd') return { text: `[MOTD] ${message.body}`, color: '#ffe17a' };
  if (message.kind === 'system') return { text: `[${message.channelName}] ${message.body}`, color: '#a9ef9d' };
  if (message.kind === 'whisper_outgoing') {
    return { text: `[To ${message.senderDisplayName}] ${message.body}`, color: '#ef9dea' };
  }
  if (message.kind === 'whisper') {
    return { text: `[From ${message.senderDisplayName}] ${message.body}`, color: '#ef9dea' };
  }
  return { text: `[${message.channelName}] ${message.senderDisplayName}: ${message.body}`, color: '#fff1cf' };
}

export function chatToggleButtonRect(historyRect: UiRect): UiRect {
  return {
    x: historyRect.x,
    y: Math.max(4, historyRect.y - CHAT_TOGGLE_SIZE - 3),
    width: CHAT_TOGGLE_SIZE,
    height: CHAT_TOGGLE_SIZE,
  };
}

export function chatOverlayLayout(
  model: Pick<ChatOverlayModel, 'width' | 'height' | 'touchControls' | 'keyboardInset'>,
  frameInsets: readonly [number, number, number, number] = [0, 0, 0, 0],
): ChatOverlayLayout {
  const width = Math.min(330, Math.max(210, Math.floor(model.width * 0.43)));
  const touch = model.touchControls === true;
  const keyboardInset = Math.max(0, model.keyboardInset ?? 0);
  const controls = touch ? touchControlLayout(model.width, model.height) : null;
  const controlsTop = controls === null ? Number.POSITIVE_INFINITY : Math.min(
    controls.joystickCenter.y - controls.joystickRadius,
    controls.interactButton.y,
    controls.secondaryButton.y,
  ) - 5;
  const keyboardTop = keyboardInset > 0 ? model.height - keyboardInset - 5 : Number.POSITIVE_INFINITY;
  const ordinaryBottom = model.height - 38;
  const inputBottom = Math.min(ordinaryBottom, controlsTop, keyboardTop);
  const inputY = Math.max(8, Math.floor(inputBottom - CHAT_INPUT_HEIGHT));
  const input = { x: 5, y: inputY, width, height: CHAT_INPUT_HEIGHT };
  const [, topInset, , bottomInset] = frameInsets;
  const frameOverhead = topInset + bottomInset + CHAT_FRAME_CONTENT_PADDING * 2;
  const availableHistoryHeight = Math.max(CHAT_LINE_HEIGHT + frameOverhead, inputY - 9);
  const visibleLines = Math.max(1, Math.min(
    CHAT_VISIBLE_LINES,
    Math.floor((availableHistoryHeight - frameOverhead) / CHAT_LINE_HEIGHT),
  ));
  const historyHeight = visibleLines * CHAT_LINE_HEIGHT + frameOverhead;
  const history = {
    x: 5,
    y: Math.max(4, inputY - historyHeight - 4),
    width,
    height: historyHeight,
  };
  return { history, input, toggle: chatToggleButtonRect(history), visibleLines };
}

function translatedRect(rect: UiRect, x: number, y: number): UiRect {
  return { ...rect, x: rect.x + x, y: rect.y + y };
}

/** Moves the whole chat composition from its toggle-button anchor while
 * keeping the expanded history/input inside the current safe viewport. */
export function positionedChatOverlayLayout(
  layout: ChatOverlayLayout,
  viewport: Pick<ChatOverlayModel, 'width' | 'height'>,
  anchor: UiPoint | null,
): ChatOverlayLayout {
  if (anchor === null) return layout;
  const rects = [layout.history, layout.input, layout.toggle];
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  const safeBottom = Math.min(viewport.height - 4, layout.input.y + layout.input.height);
  const requestedX = anchor.x - layout.toggle.x;
  const requestedY = anchor.y - layout.toggle.y;
  const offsetX = Math.max(4 - left, Math.min(viewport.width - 4 - right, requestedX));
  const offsetY = Math.max(4 - top, Math.min(safeBottom - bottom, requestedY));
  return {
    history: translatedRect(layout.history, offsetX, offsetY),
    input: translatedRect(layout.input, offsetX, offsetY),
    toggle: translatedRect(layout.toggle, offsetX, offsetY),
    visibleLines: layout.visibleLines,
  };
}

export function hasUnseenChatMessage(
  knownIds: ReadonlySet<bigint>,
  messages: readonly Pick<ChatOverlayMessage, 'id'>[],
): boolean {
  return messages.some((message) => !knownIds.has(message.id));
}

export interface ChatOverlayPreferences {
  read(key: string): string | null;
  write(key: string, value: string): void;
}
const browserPreferences: ChatOverlayPreferences = {
  read: key => typeof localStorage === 'undefined' ? null : localStorage.getItem(key),
  write: (key, value) => { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); },
};
/** One retained composition/editor; the client owns native focus, transport and world input. */
export class ChatOverlay {
  readonly root: UiRoot;
  readonly editor: CanvasTextEditor;
  private readonly view: UiChatElement;
  private model: ChatOverlayModel = { sessionKey: '', width: 480, height: 270, connected: false, canAdministerWorld: false,
    onlinePlayerNames: [], replyPlayerName: null, messages: [] };
  private readonly arrivals = new Map<bigint, number>();
  private messagesInitialized = false;
  private openValue = false;
  private collapsedValue: boolean;
  private unreadValue = false;
  private hovered = false;
  private anchor: UiPoint | null;
  private dragOrigin: UiPoint | null = null;
  private suggestionIndex = 0;
  private error: { text: string; arrivedAt: number } | null = null;
  private lastDraft = '';
  private generation = 0;
  private request = 0;
  private now = 0;
  private disposed = false;
  constructor(art: UiKitArt | undefined, private readonly send: (body: string) => Promise<void>,
    private readonly onOpenChanged: (open: boolean) => void,
    private readonly preferences: ChatOverlayPreferences = browserPreferences) {
    this.collapsedValue = storedChatCollapsed(this.read(CHAT_COLLAPSED_STORAGE_KEY));
    this.anchor = this.readAnchor();
    this.root = new UiRoot({ art, scale: 1, label: 'Chat' });
    this.editor = new CanvasTextEditor({ maxLength: 240, onChange: () => this.changed() });
    this.view = uiChat({ model: this.presentation(), editor: this.editor,
      onSubmit: body => this.submit(body), onChange: () => this.changed(),
      onToggle: () => this.setCollapsed(!this.collapsedValue), onOpen: () => this.open(), onDismiss: () => this.dismiss(),
      onSuggestionIndex: index => { this.suggestionIndex = index; this.sync(); },
      onComplete: index => this.complete(index),
      onHover: hovered => { if (this.hovered !== hovered) { this.hovered = hovered && this.active; this.sync(); } },
      onMove: delta => {
        this.dragOrigin ??= { x: this.view.toggle.rect.x, y: this.view.toggle.rect.y };
        this.anchor = { x: this.dragOrigin.x + delta.x, y: this.dragOrigin.y + delta.y }; this.sync();
      },
      onMoveEnd: () => { this.dragOrigin = null; if (this.anchor) this.write(CHAT_POSITION_STORAGE_KEY, JSON.stringify(this.anchor)); },
      onMoveCancel: () => { this.dragOrigin = null; },
    });
    this.root.mount(this.view); this.sync();
  }
  get active(): boolean { return !this.disposed && this.model.connected && this.model.interactionBlocked !== true; }
  get isOpen(): boolean { return this.openValue; }
  get isCollapsed(): boolean { return this.collapsedValue; }
  get hasUnread(): boolean { return this.unreadValue; }
  get isHovered(): boolean { return this.active && this.hovered; }
  update(model: ChatOverlayModel, now = performance.now()): void {
    if (this.disposed) return;
    if (model.sessionKey !== this.model.sessionKey || !model.connected && this.model.connected) {
      this.generation++; this.root.input.cancelPointers(); this.root.focus.set(null); this.dismiss();
      this.arrivals.clear(); this.messagesInitialized = false; this.unreadValue = false; this.error = null; this.editor.setValue('');
    }
    this.model = model; this.now = now;
    if (!this.active) { this.root.input.cancelPointers(); this.root.input.clearHover(); this.root.focus.set(null); this.hovered = false; }
    if (this.messagesInitialized && this.collapsedValue && hasUnseenChatMessage(new Set(this.arrivals.keys()), model.messages)) this.unreadValue = true;
    const current = new Set(model.messages.map(message => message.id));
    for (const message of model.messages) if (!this.arrivals.has(message.id)) this.arrivals.set(message.id, now);
    for (const id of this.arrivals.keys()) if (!current.has(id)) this.arrivals.delete(id);
    this.messagesInitialized = true;
    this.sync();
  }
  handleGlobalKeyDown(event: Pick<KeyboardEvent, 'key' | 'repeat'> & Partial<Pick<KeyboardEvent, 'isComposing' | 'ctrlKey' | 'metaKey' | 'altKey'>>): boolean {
    if (!this.active || this.openValue || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !['Enter', '/'].includes(event.key)) return false;
    this.open(event.key === '/' ? '/' : ''); return true;
  }
  open(initialValue = ''): void {
    if (!this.active) return;
    this.setCollapsed(false); this.unreadValue = false;
    if (!this.openValue) {
      this.openValue = true; this.editor.setValue(initialValue); this.suggestionIndex = 0; this.view.scrollToEnd(); this.onOpenChanged(true);
    }
    this.sync(); this.view.focusInput(); this.root.arrange();
  }
  dismiss(): void {
    if (!this.openValue) return;
    this.openValue = false; this.root.focus.set(null); this.onOpenChanged(false); this.sync();
  }
  /** Called by the coordinator for the shared native editor's blur event. */
  blurInput(): void { if (this.model.touchControls !== true) this.dismiss(); }
  private setCollapsed(value: boolean): void {
    if (value === this.collapsedValue) return;
    if (value) this.dismiss();
    this.collapsedValue = value; if (!value) this.unreadValue = false; this.hovered = false;
    this.write(CHAT_COLLAPSED_STORAGE_KEY, String(value)); this.sync();
  }
  private changed(): void {
    const value = this.editor.snapshot().value;
    if (value === this.lastDraft) return;
    this.lastDraft = value; this.suggestionIndex = 0; this.error = null;
    if (this.view) this.sync();
  }
  private complete(index: number): void {
    const suggestion = this.suggestions()[index]; if (!suggestion || !this.active || !this.openValue) return;
    this.editor.setValue(suggestion.completion); this.suggestionIndex = 0; this.sync(); this.view.focusInput(); this.root.arrange();
  }
  private submit(value: string): void {
    if (!this.active || !this.openValue || this.editor.snapshot().composing) return;
    const body = value.trim(); if (!body) { this.dismiss(); return; }
    const generation = this.generation, request = ++this.request;
    this.editor.setValue(''); this.dismiss();
    const rejected = (error: unknown) => {
      if (this.disposed || generation !== this.generation || request !== this.request) return;
      // Completion never writes the editor: a newer draft/selection/composition is independent.
      this.error = { text: error instanceof Error ? error.message : String(error), arrivedAt: this.now }; this.sync();
    };
    try { void this.send(body).catch(rejected); } catch (error) { rejected(error); }
  }
  private suggestions() { return chatCommandSuggestions(this.editor.snapshot().value, this.model.onlinePlayerNames, this.model.canAdministerWorld, this.model.replyPlayerName); }
  private presentation() {
    const lines: UiChatLine[] = [...this.model.messages].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(message => {
      const { text, color } = chatMessagePresentation(message);
      return { id: message.id.toString(), text, color, arrivedAt: this.arrivals.get(message.id) ?? this.now };
    });
    if (this.error && this.now - this.error.arrivedAt < CHAT_FADE_DELAY_MS + CHAT_FADE_DURATION_MS) lines.push({ id: 'local-error', text: `[Chat] ${this.error.text}`, color: '#ffb09b', arrivedAt: this.error.arrivedAt });
    const suggestions = this.editor && this.openValue ? this.suggestions() : [];
    this.suggestionIndex = Math.min(this.suggestionIndex, Math.max(0, suggestions.length - 1));
    return { open: this.openValue, collapsed: this.collapsedValue, unread: this.unreadValue, hovered: this.hovered,
      touch: this.model.touchControls === true, blocked: !this.active, lines, suggestions, suggestionIndex: this.suggestionIndex };
  }
  private sync(): void {
    if (!this.view || this.disposed) return;
    this.view.updateChat(this.presentation()); this.root.resize(this.model.width, this.model.height);
    const base = chatOverlayLayout(this.model, [8, 8, 8, 8]);
    const bottom = Math.max(28, Math.min(this.model.height - 4, base.input.y + base.input.height));
    const height = Math.min(170, Math.max(24, bottom - 4));
    const width = Math.max(24, Math.min(base.history.width, this.model.width - 8));
    const x = Math.max(4, Math.min(this.model.width - 4 - width, this.anchor?.x ?? 5));
    const y = Math.max(4, Math.min(bottom - height, this.anchor?.y ?? bottom - height));
    if (this.anchor) this.anchor = { x, y };
    this.view.setStyle({ position: 'absolute', inset: { left: uiFixed(x), top: uiFixed(y) }, width: uiFixed(width), height: uiFixed(this.collapsedValue ? 24 : height) });
    this.root.arrange();
  }
  private read(key: string): string | null { try { return this.preferences.read(key); } catch { return null; } }
  private write(key: string, value: string): void { try { this.preferences.write(key, value); } catch { /* Privacy mode keeps in-memory preference. */ } }
  private readAnchor(): UiPoint | null {
    try {
      const value = JSON.parse(this.read(CHAT_POSITION_STORAGE_KEY) ?? 'null') as unknown;
      if (typeof value !== 'object' || value === null) return null;
      const point = value as { x?: unknown; y?: unknown };
      return typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
    } catch { return null; }
  }
  draw(context: CanvasRenderingContext2D, now = this.now): void { if (!this.disposed) this.root.drawInContext(context, now); }
  dispose(): void { if (this.disposed) return; this.dismiss(); this.disposed = true; this.generation++; this.root.dispose(); }
}
