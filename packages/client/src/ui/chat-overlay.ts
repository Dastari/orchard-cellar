import type { PixelUi } from '../render/pixel-ui.js';
import { drawPixelText } from '../render/pixel-ui.js';
import type { UiPoint, UiRect } from './geometry.js';
import type { UiSkin } from './skin.js';
import { drawUiSkinAsset, uiSkinContentRect } from './skin.js';
import { chatCommandSuggestions } from './chat-command.js';
import { drawCanvasTextInput } from './canvas-text-input.js';
import { ScrollBar } from './scrollbar.js';

export const CHAT_FADE_DELAY_MS = 8_000;
export const CHAT_FADE_DURATION_MS = 4_000;
const CHAT_LINE_HEIGHT = 9;
const CHAT_VISIBLE_LINES = 7;
const CHAT_FRAME_CONTENT_PADDING = 2;
const CHAT_INPUT_HEIGHT = 22;
const CHAT_SCROLLBAR_GUTTER = 14;

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
  readonly width: number;
  readonly height: number;
  readonly connected: boolean;
  readonly canAdministerWorld: boolean;
  readonly onlinePlayerNames: readonly string[];
  readonly replyPlayerName: string | null;
  readonly messages: readonly ChatOverlayMessage[];
}

export function chatLineAlpha(ageMs: number, expanded: boolean): number {
  if (expanded || ageMs <= CHAT_FADE_DELAY_MS) return 1;
  return Math.max(0, 1 - (ageMs - CHAT_FADE_DELAY_MS) / CHAT_FADE_DURATION_MS);
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

interface ChatLine {
  readonly messageId: bigint;
  readonly text: string;
  readonly color: string;
  readonly arrivedAt: number;
}

function contains(rect: UiRect, point: UiPoint): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width
    && point.y >= rect.y && point.y < rect.y + rect.height;
}

export class ChatOverlay {
  private model: ChatOverlayModel = {
    width: 480, height: 270, connected: false, canAdministerWorld: false,
    onlinePlayerNames: [], replyPlayerName: null, messages: [],
  };
  private historyRect: UiRect = { x: 5, y: 133, width: 276, height: 67 };
  private inputRect: UiRect = { x: 5, y: 203, width: 276, height: CHAT_INPUT_HEIGHT };
  private readonly arrivals = new Map<bigint, number>();
  private hovered = false;
  private openValue = false;
  private errorText: string | null = null;
  private errorAt = 0;
  private suggestionIndex = 0;
  private scrollbarFocused = false;
  private readonly scrollBar: ScrollBar;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly input: HTMLInputElement,
    private readonly send: (body: string) => Promise<void>,
    private readonly onOpenChanged: (open: boolean) => void,
  ) {
    this.scrollBar = new ScrollBar(skin);
    input.id = 'chat-input';
    input.maxLength = 240;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Chat message or command');
    input.addEventListener('input', () => {
      this.errorText = null;
      this.suggestionIndex = 0;
      this.scrollbarFocused = false;
    });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
        return;
      }
      if (input.value.startsWith('/') && (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const suggestions = this.commandSuggestions();
        if (suggestions.length === 0) return;
        if (event.key === 'ArrowDown') this.suggestionIndex = (this.suggestionIndex + 1) % suggestions.length;
        else if (event.key === 'ArrowUp') this.suggestionIndex = (this.suggestionIndex + suggestions.length - 1) % suggestions.length;
        else {
          const selected = suggestions[this.suggestionIndex % suggestions.length]!;
          input.value = selected.completion;
          input.setSelectionRange(input.value.length, input.value.length);
          this.suggestionIndex = 0;
        }
        return;
      }
      const pageKey = event.key === 'PageUp' || event.key === 'PageDown';
      const focusedScrollKey = this.scrollbarFocused
        && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Home' || event.key === 'End');
      if ((pageKey || focusedScrollKey) && this.scrollBar.handleKey(event.key)) {
        event.preventDefault();
        return;
      }
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      const body = input.value.trim();
      if (body.length === 0) {
        this.close();
        return;
      }
      input.value = '';
      this.close();
      void this.send(body).catch((error: unknown) => {
        this.errorText = error instanceof Error ? error.message : String(error);
        this.errorAt = performance.now();
      });
    });
    input.addEventListener('keyup', (event) => event.stopPropagation());
    input.addEventListener('blur', () => {
      if (this.openValue) this.close();
    });
  }

  get isOpen(): boolean { return this.openValue; }
  dismiss(): void { this.close(); }

  update(model: ChatOverlayModel, now = performance.now()): void {
    const keepAtEnd = this.scrollBar.atEnd;
    this.model = model;
    const width = Math.min(330, Math.max(210, Math.floor(model.width * 0.43)));
    const inputY = Math.max(92, model.height - 60);
    this.inputRect = { x: 5, y: inputY, width, height: CHAT_INPUT_HEIGHT };
    const [, topInset, , bottomInset] = this.skin.panelParchment.slice ?? [0, 0, 0, 0];
    this.historyRect = {
      x: 5,
      y: inputY - CHAT_VISIBLE_LINES * CHAT_LINE_HEIGHT
        - topInset - bottomInset - CHAT_FRAME_CONTENT_PADDING * 2 - 4,
      width,
      height: CHAT_VISIBLE_LINES * CHAT_LINE_HEIGHT
        + topInset + bottomInset + CHAT_FRAME_CONTENT_PADDING * 2,
    };
    const content = uiSkinContentRect(this.skin.panelParchment, this.historyRect, CHAT_FRAME_CONTENT_PADDING);
    this.scrollBar.setBounds({
      x: content.x + content.width - CHAT_SCROLLBAR_GUTTER,
      y: content.y,
      width: CHAT_SCROLLBAR_GUTTER,
      height: content.height,
    });
    const current = new Set(model.messages.map((message) => message.id));
    for (const message of model.messages) {
      if (!this.arrivals.has(message.id)) {
        this.arrivals.set(message.id, now);
      }
    }
    for (const id of this.arrivals.keys()) if (!current.has(id)) this.arrivals.delete(id);
    this.scrollBar.setMetrics(this.lines().length, CHAT_VISIBLE_LINES, keepAtEnd);
  }

  handleGlobalKeyDown(event: KeyboardEvent): boolean {
    if (this.openValue || event.repeat || (event.key !== 'Enter' && event.key !== '/')) return false;
    this.open(event.key === '/' ? '/' : '');
    return true;
  }

  pointerMove(point: UiPoint): void {
    this.scrollBar.pointerMove(point);
    this.hovered = contains(this.historyRect, point) || (this.openValue && contains(this.inputRect, point));
  }

  pointerLeave(): void { this.hovered = false; this.scrollBar.pointerLeave(); }

  pointerDown(point: UiPoint, button: number): boolean {
    if (button !== 0 || (!contains(this.historyRect, point) && !contains(this.inputRect, point))) return false;
    this.open();
    if (contains(this.historyRect, point)) {
      this.scrollbarFocused = true;
      this.scrollBar.pointerDown(point);
    } else {
      this.scrollbarFocused = false;
    }
    return true;
  }

  pointerUp(): boolean { return this.scrollBar.pointerUp(); }

  wheel(point: UiPoint, deltaY: number): boolean {
    if (!contains(this.historyRect, point) || deltaY === 0) return false;
    this.scrollBar.wheel(deltaY);
    return true;
  }

  draw(context: CanvasRenderingContext2D, now = performance.now()): void {
    const expanded = this.openValue || this.hovered;
    const lines = this.lines();
    const visible = lines.slice(this.scrollBar.position, this.scrollBar.position + CHAT_VISIBLE_LINES);
    if (expanded) {
      context.save();
      context.globalAlpha = 0.9;
      drawUiSkinAsset(context, this.skin.panelParchment, this.historyRect);
      context.restore();
    }
    const content = this.historyContentRect();
    const firstLineY = content.y + content.height - visible.length * CHAT_LINE_HEIGHT;
    context.save();
    context.beginPath();
    context.rect(content.x, content.y, content.width, content.height);
    context.clip();
    visible.forEach((line, index) => {
      const alpha = chatLineAlpha(now - line.arrivedAt, expanded);
      if (alpha <= 0) return;
      const y = firstLineY + index * CHAT_LINE_HEIGHT;
      context.save();
      context.globalAlpha = alpha;
      drawPixelText(context, this.fonts, line.text, content.x + 1, y + 1, { color: '#251b18' });
      drawPixelText(context, this.fonts, line.text, content.x, y, { color: line.color });
      context.restore();
    });
    context.restore();
    if (expanded) this.scrollBar.draw(context);
    if (!this.openValue) return;
    const suggestions = this.commandSuggestions();
    if (this.input.value.startsWith('/') && suggestions.length > 0) {
      const visibleSuggestions = suggestions.slice(0, 4);
      const predictionRect = {
        x: this.inputRect.x,
        y: this.inputRect.y - (visibleSuggestions.length * CHAT_LINE_HEIGHT + 20),
        width: this.inputRect.width,
        height: visibleSuggestions.length * CHAT_LINE_HEIGHT + 16,
      };
      drawUiSkinAsset(context, this.skin.panelParchment, predictionRect);
      const predictionContent = uiSkinContentRect(this.skin.panelParchment, predictionRect, 0);
      visibleSuggestions.forEach((suggestion, index) => {
        const selected = index === this.suggestionIndex % visibleSuggestions.length;
        if (selected) {
          context.fillStyle = '#9d684366';
          context.fillRect(predictionContent.x, predictionContent.y + index * CHAT_LINE_HEIGHT,
            predictionContent.width, CHAT_LINE_HEIGHT);
        }
        drawPixelText(context, this.fonts, suggestion.label, predictionContent.x + 1,
          predictionContent.y + index * CHAT_LINE_HEIGHT + 1, { color: '#fff1cf' });
        drawPixelText(context, this.fonts, suggestion.label, predictionContent.x,
          predictionContent.y + index * CHAT_LINE_HEIGHT, { color: '#3f2d25' });
      });
    }
    drawUiSkinAsset(context, this.skin.frameThin, this.inputRect);
    const prefix = this.input.value.startsWith('/') ? 'COMMAND: ' : 'SAY [General]: ';
    drawCanvasTextInput(context, this.fonts, this.input, {
      x: this.inputRect.x + 7,
      y: this.inputRect.y + 6,
      width: this.inputRect.width - 14,
      prefix,
      placeholder: this.input.value.startsWith('/') ? 'COMMAND' : 'MESSAGE',
      now,
    });
  }

  private lines(): readonly ChatLine[] {
    const content = this.historyContentRect();
    const maximumCharacters = Math.max(8, Math.floor(content.width / 6));
    const messages = [...this.model.messages].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const lines: ChatLine[] = [];
    for (const message of messages) {
      const presentation = chatMessagePresentation(message);
      for (const text of wrapChatText(presentation.text, maximumCharacters)) {
        lines.push({ messageId: message.id, text, color: presentation.color, arrivedAt: this.arrivals.get(message.id) ?? 0 });
      }
    }
    if (this.errorText !== null && performance.now() - this.errorAt < CHAT_FADE_DELAY_MS + CHAT_FADE_DURATION_MS) {
      for (const text of wrapChatText(`[Chat] ${this.errorText}`, maximumCharacters)) {
        lines.push({ messageId: -1n, text, color: '#ffb09b', arrivedAt: this.errorAt });
      }
    }
    return lines;
  }

  private commandSuggestions() {
    return chatCommandSuggestions(
      this.input.value,
      this.model.onlinePlayerNames,
      this.model.canAdministerWorld,
      this.model.replyPlayerName,
    );
  }

  private historyContentRect(): UiRect {
    const content = uiSkinContentRect(this.skin.panelParchment, this.historyRect, CHAT_FRAME_CONTENT_PADDING);
    return { ...content, width: Math.max(1, content.width - CHAT_SCROLLBAR_GUTTER) };
  }

  private open(initialValue = ''): void {
    if (!this.model.connected) return;
    if (!this.openValue) {
      this.openValue = true;
      this.scrollBar.scrollToEnd();
      this.suggestionIndex = 0;
      this.input.value = initialValue;
      this.onOpenChanged(true);
    }
    this.input.focus({ preventScroll: true });
  }

  private close(): void {
    if (!this.openValue) return;
    this.openValue = false;
    this.scrollbarFocused = false;
    this.input.blur();
    this.onOpenChanged(false);
  }
}
