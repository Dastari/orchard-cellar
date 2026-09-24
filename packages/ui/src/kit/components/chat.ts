import { drawPixelText } from '../../pixel-ui.js';
import { containsPoint, type UiPoint } from '../../geometry.js';
import { UiElement, type UiElementKey } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { scrollUiElement } from '../layout/scroll.js';
import { paintUiSkin } from './art.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText, uiTextLines } from './text.js';
import { uiInput } from './input.js';
import { uiIconButton } from './media.js';
import { uiButton } from './button.js';
import { uiTooltip } from './tooltip.js';
import { uiList } from './collections.js';
import type { ChatCommandSuggestion } from '../../chat-command.js';
export const UI_CHAT_FADE_DELAY_MS = 8_000;
export const UI_CHAT_FADE_DURATION_MS = 4_000;
export function uiChatLineAlpha(age: number, expanded: boolean): number {
  return expanded || age <= UI_CHAT_FADE_DELAY_MS ? 1 : Math.max(0, 1 - (age - UI_CHAT_FADE_DELAY_MS) / UI_CHAT_FADE_DURATION_MS);
}
export function uiChatHistoryExpanded(touch: boolean, open: boolean, hovered: boolean): boolean { return open || !touch && hovered; }
export interface UiChatLine { readonly id: string; readonly text: string; readonly arrivedAt: number; readonly tone?: UiTone; readonly color?: string }
export interface UiChatModel {
  readonly open: boolean; readonly collapsed: boolean; readonly unread: boolean;
  readonly hovered: boolean; readonly touch: boolean; readonly blocked: boolean;
  readonly lines: readonly UiChatLine[]; readonly suggestions: readonly ChatCommandSuggestion[];
  readonly suggestionIndex: number;
}
export interface UiChatOptions {
  readonly model: UiChatModel; readonly editor?: CanvasTextEditor; readonly layout?: UiStyle;
  readonly onSubmit: (value: string) => void; readonly onChange: () => void;
  readonly onToggle: () => void; readonly onSuggestionIndex: (index: number) => void; readonly onComplete: (index: number) => void;
  readonly onMove: (delta: UiPoint) => void; readonly onMoveEnd: () => void;
  readonly onMoveCancel?: () => void; readonly onOpen?: () => void; readonly onDismiss?: () => void; readonly onHover?: (hovered: boolean) => void;
}
export interface UiChatElement extends UiElement {
  readonly editor: CanvasTextEditor; readonly history: UiElement; readonly input: UiElement; readonly toggle: UiElement;
  updateChat(model: UiChatModel): void;
  scrollToEnd(): void;
  scrollHistory(key: UiElementKey['key']): boolean;
  focusInput(): void;
}
/** Chat paints and hits one retained composition; hosts own transport and session preferences. */
export function uiChat(options: UiChatOptions): UiChatElement {
  let model = options.model, lineKey = '', wrappedKey = '', suggestionsKey = '', followEnd = false;
  let historyNavigation = false, previousDraft = '', historyClickAllowed = false, revealSuggestion = true;
  const activateHistory = () => { options.onOpen?.(); historyNavigation = true; };
  const editor = options.editor ?? new CanvasTextEditor({ maxLength: 240 });
  const history = uiList<UiChatLine>({ id: 'chat.history', label: 'Chat history', items: [], key: line => line.id, rowHeight: uiFixed(10), rowPadding: 0, tone: 'primary',
    selectionChrome: false, onSelect: () => { if (historyClickAllowed) activateHistory(); }, onActivate: activateHistory,
    layout: { width: 'grow', height: 'grow', minHeight: uiFixed(0) },
    onArrange(element) {
      const width = Math.max(1, element.contentRect.width - 12), key = `${width}:${lineKey}`;
      if (key !== wrappedKey) {
        wrappedKey = key;
        element.setProps({ items: model.lines.flatMap(line => uiTextLines(line.text, width, 'body', true)
          .map((text, index) => ({ ...line, id: `${line.id}.${index}`, text }))) });
      }
      if (followEnd) {
        followEnd = false;
        const height = (element.props['items'] as readonly UiChatLine[]).length * 10;
        element.scroll.maxY = Math.max(0, height - element.contentRect.height);
        scrollUiElement(element, 0, element.scroll.maxY);
      }
    },
    render(line) {
      const text = uiText(line.text, { outline: true, layout: { width: 'grow' } });
      const plain = uiText(line.text, { layout: { width: 'grow' } });
      return new UiElement({ ...text.hooks, id: `chat.message.${line.id}`, animated: true,
        paint(element, state) {
          const expanded = uiChatHistoryExpanded(model.touch, model.open, model.hovered); state.context.globalAlpha *= uiChatLineAlpha(state.now - line.arrivedAt, expanded);
          if (line.color && state.art) {
            drawPixelText(state.context, state.art.pixel, line.text, element.rect.x + 1, element.rect.y + 1, { color: '#251b18' });
            drawPixelText(state.context, state.art.pixel, line.text, element.rect.x, element.rect.y, { color: line.color });
          } else (expanded ? plain : text).hooks.paint?.(element, state);
        },
      }).setProps({tone:line.tone ?? 'neutral'});
    },
  });
  const panel = new UiElement({ kind: 'chat-history-panel', pointerMode: 'capture', props: { tone: 'primary', touchScroll: true, singlePointer: true },
    style: { width: 'grow', height: 'grow', minHeight: uiFixed(0), padding: 8 }, children: [history],
    onPointer(event) { if (event.type === 'down' && event.button === 0) { event.capture(); return true; } if (event.type === 'up' && event.button === 0) { activateHistory(); event.release(); } return true; },
    paint(element, { context, art }) {
      if (art && (uiChatHistoryExpanded(model.touch, model.open, model.hovered))) paintUiSkin(context, art.skin.frame, 'primary.idle', element.rect);
    },
  });
  const baseInput = uiInput({ id: 'chat.input', label: 'Chat message or command', editor, placeholder: 'SAY [General]: MESSAGE',
    onChange: () => { historyNavigation = false; options.onChange(); }, onSubmit: value => { if (!editor.snapshot().composing) options.onSubmit(value); }, layout: { width: 'grow', shrink: 0 } });
  const input = new UiElement({ ...baseInput.hooks, onPointer(event, element) {
    if (event.type === 'down') historyNavigation = false;
    return baseInput.hooks.onPointer?.(event, element) ?? false;
  } });
  const suggestions = uiScrollArea({ id: 'chat.suggestions', width: 'grow', gap: 2, height: 'fit', maxHeight: uiFixed(70), padding: { right: 4 }, overflow: 'scroll-y', shrink: 0,
    onArrange(element) {
      if (!revealSuggestion) return;
      revealSuggestion = false;
      const y = model.suggestionIndex * 18;
      if (y < element.scroll.y) scrollUiElement(element, 0, y);
      else if (y + 16 > element.scroll.y + element.contentRect.height) scrollUiElement(element, 0, y + 16 - element.contentRect.height);
    },
  });
  suggestions.setProps({ singlePointer: true }); suggestions.pointerMode = 'capture';
  const inputPanel = new UiElement({ kind: 'chat-editor-panel', props: { tone: 'primary', singlePointer: true },
    style: { display: 'stack', width: 'grow', height: uiFixed(24), shrink: 0 }, children: [input],
    paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.frame, 'primary.idle', element.rect); },
  });
  const base = uiIconButton({ cf: 'chat' }, { id: 'chat.toggle', label: 'Chat', tone: 'primary', layout: { width: uiFixed(24), height: uiFixed(24), shrink: 0 }, onPress: options.onToggle });
  let drag: { start: UiPoint; moved: boolean; pointerId: number } | undefined;
  const toggle = new UiElement({ ...base.hooks, props: { ...base.props, singlePointer: true }, style: base.style, children: [...base.children],
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) drag = { start: event.point, moved: false, pointerId: event.pointerId };
      if (event.type === 'move' && drag?.pointerId === event.pointerId) {
        const delta = { x: event.point.x - drag.start.x, y: event.point.y - drag.start.y };
        drag.moved ||= Math.hypot(delta.x, delta.y) >= 4;
        if (drag.moved) { options.onMove(delta); return true; }
      }
      if ((event.type === 'up' || event.type === 'cancel') && drag?.pointerId === event.pointerId) {
        const moved = drag.moved; drag = undefined;
        if (moved) { base.hooks.onPointer?.({ ...event, type: 'cancel' }, element); if (event.type === 'up') options.onMoveEnd(); else options.onMoveCancel?.(); return true; }
      }
      return base.hooks.onPointer?.(event, element) ?? false;
    },
  });
  const toggleTip = uiTooltip(() => model.touch ? '' : 'CHAT', toggle);
  const baseShell = uiFlex({ id: 'game.chat', width: 'grow', height: 'grow', gap: 4, ...options.layout }, [
    uiFlex({ direction: 'row', width: 'grow', shrink: 0 }, [toggleTip]), panel, suggestions, inputPanel,
  ]);
  let hoverPoint: UiPoint | null = null;
  const hoveredControl = () => hoverPoint !== null && (containsPoint(toggle.rect, hoverPoint) || !model.collapsed && (panel.visible && containsPoint(panel.rect, hoverPoint) || model.open && (containsPoint(input.rect, hoverPoint) || model.suggestions.length > 0 && containsPoint(suggestions.rect, hoverPoint))));
  const shell = new UiElement({ ...baseShell.hooks, props: { touchScroll: true }, children: [...baseShell.children],
    onHover: hovered => options.onHover?.(hovered && hoveredControl()),
    onPointerObserved(event) {
      hoverPoint = event.type === 'cancel' ? null : event.point; options.onHover?.(hoveredControl());
      if (event.type === 'down' && containsPoint(history.clip, event.point)) historyClickAllowed = event.button === 0;
    },
    onArrange(element) {
      const compact = element.rect.height < 90;
      const historyVisible = !model.collapsed && (!model.open || !compact);
      if (panel.visible !== historyVisible) panel.setStyle({ visible: historyVisible });
      const inputHeight = compact ? 22 : 24;
      if (JSON.stringify(input.style.height) !== JSON.stringify(uiFixed(inputHeight))) { input.setStyle({ height: uiFixed(inputHeight) }); inputPanel.setStyle({ height: uiFixed(inputHeight) }); }
      const budget = Math.max(16, Math.min(70, element.rect.height - (compact ? 54 : 90)));
      const limit = Math.max(16, Math.floor((budget + 2) / 18) * 18 - 2);
      if (JSON.stringify(suggestions.style.maxHeight) !== JSON.stringify(uiFixed(limit))) { revealSuggestion = true; suggestions.setStyle({ maxHeight: uiFixed(limit) }); }
    },
    onKeyCapture(event) {
      if (event.repeat && ['Enter', ' '].includes(event.key) && !editor.snapshot().focused) return true;
      if (event.key === 'Enter' && (event.repeat || editor.snapshot().composing)) return true;
      if (model.open && event.key === 'Escape') { if (!event.repeat) options.onDismiss?.(); return true; }
      if (model.open && historyNavigation && !editor.snapshot().value.startsWith('/') && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { scrollHistory(event.key); return true; }
      if (model.open && ['PageUp', 'PageDown'].includes(event.key)) { scrollHistory(event.key); return true; }
      if (model.open && editor.snapshot().focused && !editor.snapshot().value.startsWith('/') && ['ArrowUp', 'ArrowDown'].includes(event.key)) return true;
      if (!model.open || !editor.snapshot().value.startsWith('/') || !['Tab','ArrowUp','ArrowDown'].includes(event.key)) return false;
      if (model.suggestions.length) {
        if (event.key === 'Tab') options.onComplete(model.suggestionIndex);
        else options.onSuggestionIndex((model.suggestionIndex + (event.key === 'ArrowUp' ? -1 : 1) + model.suggestions.length) % model.suggestions.length);
      }
      return true;
    },
  });
  const scrollToEnd = () => { followEnd = true; history.invalidate(); };
  const updateChat = (next: UiChatModel): void => {
    const atEnd = history.scroll.y >= history.scroll.maxY - 1;
    if (model.suggestionIndex !== next.suggestionIndex) revealSuggestion = true;
    model = next;
    history.setProps({ scrollbarVisible: uiChatHistoryExpanded(model.touch, model.open, model.hovered) }, false);
    const draft = editor.snapshot().value; if (draft !== previousDraft) { previousDraft = draft; historyNavigation = false; }
    shell.setDisabled(model.blocked);
    toggle.setProps({ tone: model.unread ? 'success' : 'primary' });
    panel.setStyle({ visible: !model.collapsed }); input.setStyle({ visible: model.open && !model.collapsed }); inputPanel.setStyle({ visible: model.open && !model.collapsed });
    suggestions.setStyle({ visible: model.open && !model.collapsed && model.suggestions.length > 0 });
    const key = model.lines.map(line => `${line.id}:${line.arrivedAt}:${line.tone}:${line.color}:${line.text}`).join('\u0000');
    if (key !== lineKey) {
      lineKey = key;
      history.invalidate();
      if (atEnd) scrollToEnd();
    }
    const keySuggestions = JSON.stringify(model.suggestions);
    if (keySuggestions !== suggestionsKey) {
      suggestionsKey = keySuggestions; revealSuggestion = true;
      for (const child of [...suggestions.children]) child.dispose();
      suggestions.replaceChildren(model.suggestions.map((suggestion, index) => uiButton({ id: `chat.suggestion.${index}`, label: suggestion.label,
        size: 'sm', layout: { width: 'grow', shrink: 0 }, onPress: () => options.onComplete(index) })));
    }
    for (const [index, button] of suggestions.children.entries()) button.setProps({tone:index === model.suggestionIndex ? 'primary' : 'neutral'});
  };
  const scrollHistory = (key: string): boolean => {
    const next = key === 'Home' ? 0 : key === 'End' ? history.scroll.maxY : history.scroll.y
      + (key === 'PageUp' ? -history.contentRect.height : key === 'PageDown' ? history.contentRect.height : key === 'ArrowUp' ? -10 : key === 'ArrowDown' ? 10 : 0);
    return scrollUiElement(history, history.scroll.x, next);
  };
  updateChat(model);
  return Object.assign(shell, { editor, history, input, toggle, updateChat, scrollToEnd, scrollHistory,
    focusInput() { if (model.open && !model.blocked) input.requestFocus(); },
  });
}
export function uiChatContains(element: UiElement, point: UiPoint): boolean { return containsPoint(element.clip, point); }
