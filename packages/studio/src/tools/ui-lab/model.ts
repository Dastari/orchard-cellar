import { UI_LAB_SPECIMENS } from '@orchard/ui';

export const UI_LAB_TOOL_REGISTRATION = Object.freeze({
  id: 'ui-lab', label: 'UI Lab', mode: 'author' as const, icon: 'editor.ui',
  routes: Object.freeze(['/author/ui-lab'] as const),
  docks: Object.freeze(['tool_registry', 'inspector', 'validation'] as const),
  commands: Object.freeze([{ id: 'ui.scale', label: 'Change UI scale' }] as const),
});

export function createUiLabSnapshot() {
  return { specimens: UI_LAB_SPECIMENS };
}
