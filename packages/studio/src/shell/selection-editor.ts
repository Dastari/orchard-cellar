import { ui, type UiElement } from '@orchard/ui/studio';

/** A compact mode picker keeps every editor reachable in a narrow drawer. */
export function studioSelectionEditor(options: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly tabs: readonly { readonly id: string; readonly label: string; readonly content: UiElement }[];
}): UiElement {
  const selected = options.tabs.find(tab => tab.id === options.value) ?? options.tabs[0];
  return ui.flex({ id: options.id, width: 'grow', height: 'grow', gap: 8 }, [
    ui.select({ id: `${options.id}:mode`, label: options.label, value: selected?.id ?? '',
      options: options.tabs.map(tab => ({ value: tab.id, label: tab.label })),
      onChange: options.onChange, layout: { width: 'grow', shrink: 0 } }),
    ...options.tabs.map(tab => { tab.content.setStyle({ visible: tab.id === selected?.id }); return tab.content; }),
  ]);
}
