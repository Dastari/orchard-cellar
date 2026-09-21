import { containsPoint, type UiPoint } from '../../geometry.js';
import { UiElement, type UiElementKey } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { scrollUiElement } from '../layout/scroll.js';
import { paintUiSkin } from './art.js';
import { uiFlex } from './layout.js';
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
export interface UiChatLine { readonly id: string; readonly text: string; readonly arrivedAt: number; readonly tone?: UiTone }
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
  const editor = options.editor ?? new CanvasTextEditor({ maxLength: 240 });
  const history = uiList<UiChatLine>({ id: 'chat.history', label: 'Chat history', items: [], key: line => line.id, rowHeight: uiFixed(10), rowPadding: 0, tone: 'primary',
    layout: { width: 'grow', height: 'grow', minHeight: uiFixed(0) },
    onArrange(element) {
      const width = Math.max(1, element.contentRect.width - 4), key = `${width}:${lineKey}`;
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
        paint(element, state) { const expanded = uiChatHistoryExpanded(model.touch, model.open, model.hovered); state.context.globalAlpha *= uiChatLineAlpha(state.now - line.arrivedAt, expanded); (expanded ? plain : text).hooks.paint?.(element, state); },
      }).setProps({tone:line.tone ?? 'neutral'});
    },
  });
  const panel = new UiElement({ kind: 'chat-history-panel', props: { tone: 'primary' },
    style: { width: 'grow', height: 'grow', minHeight: uiFixed(0), padding: 8 }, children: [history],
    paint(element, { context, art }) {
      if (art && (uiChatHistoryExpanded(model.touch, model.open, model.hovered))) paintUiSkin(context, art.skin.frame, 'primary.idle', element.rect);
    },
  });
  const input = uiInput({ id: 'chat.input', label: 'Chat message or command', editor, placeholder: 'SAY [General]: MESSAGE',
    onChange: options.onChange, onSubmit: options.onSubmit, layout: { width: 'grow', shrink: 0 } });
  const suggestions = uiFlex({ id: 'chat.suggestions', width: 'grow', gap: 2, shrink: 0 });
  const base = uiIconButton({ cf: 'chat' }, { id: 'chat.toggle', label: 'Chat', tone: 'primary', layout: { width: uiFixed(24), height: uiFixed(24), shrink: 0 }, onPress: options.onToggle });
  let drag: { start: UiPoint; moved: boolean } | undefined;
  const toggle = new UiElement({ ...base.hooks, props: base.props, style: base.style, children: [...base.children],
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) drag = { start: event.point, moved: false };
      if (event.type === 'move' && drag) {
        const delta = { x: event.point.x - drag.start.x, y: event.point.y - drag.start.y };
        drag.moved ||= Math.hypot(delta.x, delta.y) >= 4;
        if (drag.moved) { options.onMove(delta); return true; }
      }
      if ((event.type === 'up' || event.type === 'cancel') && drag) {
        const moved = drag.moved; drag = undefined;
        if (moved) { base.hooks.onPointer?.({ ...event, type: 'cancel' }, element); if (event.type === 'up') options.onMoveEnd(); return true; }
      }
      return base.hooks.onPointer?.(event, element) ?? false;
    },
  });
  const toggleTip = uiTooltip(() => model.touch ? '' : 'CHAT', toggle);
  const baseShell = uiFlex({ id: 'game.chat', width: 'grow', height: 'grow', gap: 4, ...options.layout }, [
    uiFlex({ direction: 'row', width: 'grow', shrink: 0 }, [toggleTip]), panel, suggestions, input,
  ]);
  const shell = new UiElement({ ...baseShell.hooks, children: [...baseShell.children],
    onKeyCapture(event) {
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
    const atEnd = history.scroll.y >= history.scroll.maxY - 1; model = next;
    shell.setDisabled(model.blocked);
    toggle.setProps({ tone: model.unread ? 'success' : 'primary' });
    panel.setStyle({ visible: !model.collapsed }); input.setStyle({ visible: model.open && !model.collapsed });
    suggestions.setStyle({ visible: model.open && !model.collapsed && model.suggestions.length > 0 });
    const key = model.lines.map(line => `${line.id}:${line.arrivedAt}:${line.tone}:${line.text}`).join('\u0000');
    if (key !== lineKey) {
      lineKey = key;
      history.invalidate();
      if (atEnd) scrollToEnd();
    }
    const keySuggestions = JSON.stringify(model.suggestions);
    if (keySuggestions !== suggestionsKey) {
      suggestionsKey = keySuggestions;
      suggestions.replaceChildren(model.suggestions.map((suggestion, index) => uiButton({ id: `chat.suggestion.${index}`, label: suggestion.label,
        size: 'sm', layout: { width: 'grow' }, onPress: () => options.onComplete(index) })));
    }
    for (const [index, button] of suggestions.children.entries()) button.setProps({tone:index === model.suggestionIndex ? 'primary' : 'neutral'});
  };
  updateChat(model);
  return Object.assign(shell, { editor, history, input, toggle, updateChat, scrollToEnd,
    focusInput() { if (model.open && !model.blocked) input.requestFocus(); },
    scrollHistory(key: string) {
      const next = key === 'Home' ? 0 : key === 'End' ? history.scroll.maxY : history.scroll.y
        + (key === 'PageUp' ? -history.contentRect.height : key === 'PageDown' ? history.contentRect.height : key === 'ArrowUp' ? -10 : key === 'ArrowDown' ? 10 : 0);
      return scrollUiElement(history, history.scroll.x, next);
    },
  });
}
export function uiChatContains(element: UiElement, point: UiPoint): boolean { return containsPoint(element.clip, point); }
