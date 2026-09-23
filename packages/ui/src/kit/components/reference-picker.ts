import type { ContentReferenceUse } from '@orchard/sim';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import type { UiElement } from '../runtime/element.js';
import { uiFlex } from './layout.js';
import { uiCombobox } from './select.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';

export interface UiContentReference { readonly id: string; readonly kind: string; readonly label: string }
export interface UiReferencePickerOptions {
  readonly id: string; readonly label: string; readonly kind: string; readonly value: string;
  readonly choices: readonly UiContentReference[]; readonly disabled?: boolean;
  readonly editor?: CanvasTextEditor; readonly preview?: (id: string) => UiElement | undefined;
  readonly onChange: (value: string) => void; readonly onOpen?: (id: string) => void;
}
export function uiReferencePicker(options: UiReferencePickerOptions): UiElement {
  const choices = options.choices.filter(choice => choice.kind === options.kind);
  const selected = choices.find(choice => choice.id === options.value);
  const preview = selected ? options.preview?.(selected.id) : undefined;
  return uiFlex({ width: 'grow', gap: 4 }, [
    uiText(options.label),
    uiCombobox({ id: options.id, label: options.label, disabled: options.disabled,
      editor: options.editor ?? new CanvasTextEditor({ value: selected?.label ?? options.value }),
      options: choices.map(choice => ({ value: choice.id, label: `${choice.label} (${choice.id})` })),
      onChange: value => { if (!options.disabled && choices.some(choice => choice.id === value)) options.onChange(value); },
    }),
    ...(preview ? [preview] : []),
    uiText(selected ? selected.id : `Missing ${options.kind} reference: ${options.value || '(empty)'}`, { wrap: true }),
    ...(options.onOpen ? [uiButton({ id: `${options.id}:open`, label: 'Open definition', disabled: !selected, onPress: () => { if (selected) options.onOpen?.(selected.id); } })] : []),
  ]);
}
export function uiUsedBy(options: { readonly id: string; readonly uses: readonly ContentReferenceUse[]; readonly onOpen: (id: string) => void }): UiElement {
  return uiFlex({ width: 'grow', gap: 4 }, [uiText(`Used by (${options.uses.length})`),
    ...(options.uses.length ? options.uses.map((use, index) => uiButton({ id: `${options.id}:${index}`, label: `${use.sourceId} · ${use.path}`, onPress: () => options.onOpen(use.sourceId) })) : [uiText('No references in this content registry.')]),
  ]);
}
