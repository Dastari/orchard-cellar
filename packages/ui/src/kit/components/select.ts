import { CanvasTextEditor } from '../runtime/text-editor.js';
import { UiElement, type UiElementKey } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone, UiControlSize } from '../tokens.js';
import { uiFlex } from './layout.js';
import { uiButton } from './button.js';
import { uiText } from './text.js';
import { uiInput } from './input.js';
import { uiIcon } from './media.js';
import { uiList } from './collections.js';
import { uiPopover } from './overlays.js';
export interface UiSelectOption { readonly value: string; readonly label: string; readonly group?: string; readonly disabled?: boolean }
export interface UiSelectOptions {
  readonly id?: string; readonly label: string; readonly value?: string; readonly options: readonly UiSelectOption[];
  readonly placeholder?: string; readonly size?: UiControlSize; readonly disabled?: boolean; readonly tone?: UiTone; readonly layout?: UiStyle; readonly onChange?: (value: string) => void;
}
export function uiSelect(options: UiSelectOptions): UiElement {
  let search = '', typed = -Infinity;
  const label = (value: string | undefined) => options.options.find(item => item.value === value)?.label ?? options.placeholder ?? 'Select...';
  const choose = (item: UiSelectOption) => { if (item.disabled) return; control.setProps({ value: item.value, label: item.label }); options.onChange?.(item.value); popup.close(); };
  const list = uiList({ label: `${options.label} options`, items: options.options, key: item => item.value, layout: { height: uiFixed(Math.max(24, Math.min(144, options.options.length * 24))) },
    render: item => uiText(`${item.group ? `${item.group}: ` : ''}${item.label}${item.disabled ? ' (unavailable)' : ''}`, { overflow: 'ellipsis' }), onSelect: (_keys, item) => choose(item) });
  const open = () => { list.setProps({ active: Math.max(0, options.options.findIndex(item => item.value === control.props['value'])) }); popup.open(control); };
  const base = uiButton({ id: options.id, label: label(options.value), tone: options.tone, size: options.size, disabled: options.disabled, trailing: uiIcon({ lucide: 'chevronDown' }), layout: { width: 'grow', ...options.layout }, onPress: () => { if (popup.visible) popup.close(); else open(); } });
  const control = new UiElement({ ...base.hooks, kind: 'select', props: { ...base.props, selectionControl: true, value: options.value }, children: [...base.children], onKey(event, element) {
    if (['ArrowDown','ArrowUp','Home','End','PageDown','PageUp'].includes(event.key)) { if (!popup.visible) open(); else list.hooks.onKey?.(event, list); return true; }
    if (popup.visible && event.key === 'Enter') return list.hooks.onKey?.(event, list) ?? false;
    if (event.key === 'Escape' && popup.visible) { popup.close(); return true; }
    if (event.key.length === 1 && event.key !== ' ') {
      const now = performance.now(); search = now - typed > 700 ? event.key : search + event.key; typed = now;
      const index = options.options.findIndex(item => !item.disabled && item.label.toLowerCase().startsWith(search.toLowerCase()));
      if (index >= 0) { if (!popup.visible) open(); list.setProps({ active: index }); }
      return true;
    }
    return base.hooks.onKey?.(event, element) ?? false;
  } });
  const popup = uiPopover({ anchor: control, content: list });
  return uiFlex({ label: options.label, width: 'grow', ...options.layout }, [control, popup]);
}
export interface UiComboboxOptions extends Omit<UiSelectOptions, 'options'> {
  readonly options?: readonly UiSelectOption[]; readonly suggestions?: (query: string, signal: AbortSignal) => Promise<readonly UiSelectOption[]>;
  readonly onCreate?: (query: string) => void;
  readonly editor?: CanvasTextEditor; readonly onQueryChange?: (query: string) => void;
  readonly open?: boolean; readonly onOpenChange?: (open: boolean) => void;
}
export function uiCombobox(options: UiComboboxOptions): UiElement {
  if(options.editor && options.value !== undefined) throw new Error('An external combobox editor owns its value');
  const editor=options.editor??new CanvasTextEditor({value:options.value});
  let request: AbortController | undefined, revision = 0, query = editor.snapshot().value, disposed = false;
  const choose = (item: UiSelectOption) => {
    if (item.disabled) return;
    editor.setValue(item.value === '__create__' ? query : item.label);
    if (item.value === '__create__') options.onCreate?.(query); else options.onChange?.(item.value);
    popup.close();
  };
  const highlight = (item: UiSelectOption) => {
    const index = item.label.toLowerCase().indexOf(query.toLowerCase());
    if (!query || index < 0) return uiText(item.label, { overflow: 'ellipsis' });
    return uiFlex({ direction: 'row', gap: 0 }, [uiText(item.label.slice(0, index)), uiText(item.label.slice(index, index + query.length), { outline: true }), uiText(item.label.slice(index + query.length))]);
  };
  const list = uiList({ label: `${options.label} suggestions`, items: options.options ?? [], key: item => item.value, render: highlight, layout: { height: uiFixed(144) }, onSelect: (_keys, item) => choose(item) });
  const status = uiText('Type to search');
  const update = (text: string) => {
    query = text; options.onQueryChange?.(text); options.onOpenChange?.(true); revision++; const generation = revision; request?.abort(); request = new AbortController();
    status.setProps({ text: options.suggestions ? 'Loading suggestions...' : '' }); popup.open(input);
    const result = options.suggestions ? options.suggestions(text, request.signal) : Promise.resolve((options.options ?? []).filter(item => item.label.toLowerCase().includes(text.toLowerCase())));
    void result.then(items => {
      if (disposed || generation !== revision) return;
      const create = options.onCreate && text.trim() && !items.some(item => item.label.toLowerCase() === text.toLowerCase()) ? [{ value: '__create__', label: `Create ${text}` }] : [];
      list.setProps({ items: [...items, ...create], active: 0 }); status.setProps({ text: items.length || create.length ? '' : 'No suggestions' });
      popup.open(input);
    }).catch(() => { if (!disposed && generation === revision && !request?.signal.aborted) status.setProps({ text: 'Could not load suggestions. Type to retry.' }); });
  };
  const input = uiInput({ id: options.id, label: options.label, editor, placeholder: options.placeholder, disabled: options.disabled, tone: options.tone, size: options.size, onChange: update });
  const popup = uiPopover({ anchor: input, content: uiFlex({ gap: 4 }, [status, list]), onClose: () => { revision++; request?.abort(); options.onOpenChange?.(false); } });
  const route = (event: UiElementKey) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { if (!popup.visible) update(editor.snapshot().value); else list.hooks.onKey?.(event, list); return true; }
    if (popup.visible && event.key === 'Enter') return list.hooks.onKey?.(event, list) ?? false;
    if (popup.visible && event.key === 'Escape') { revision++; request?.abort(); popup.close(); return true; } return false;
  };
  const combo = new UiElement({ kind: 'combobox', label: options.label, style: { width: 'grow', display: 'flex', direction: 'column', ...options.layout }, children: [input, popup],
    onKeyCapture: route, onDispose() { disposed = true; request?.abort(); },
  });
  if(options.open)update(editor.snapshot().value);
  return combo;
}
