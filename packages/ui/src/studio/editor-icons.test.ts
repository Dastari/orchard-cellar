import { describe, expect, it } from 'vitest';
import { EDITOR_ICONS, editorIcon, editorUiSymbol } from './editor-icons.js';

const ROUTE_ICONS = [
  'editor.route.map',
  'editor.route.object',
  'editor.route.ui_lab',
  'editor.route.character',
  'editor.route.items',
] as const;

describe('semantic editor icon registry', () => {
  it('resolves every development route through a distinct reviewed icon', () => {
    const definitions = ROUTE_ICONS.map((iconId) => editorIcon(iconId));
    expect(definitions.every((icon) => icon.kind === 'generated')).toBe(true);
    expect(new Set(definitions.map((icon) => icon.kind === 'generated'
      ? `${icon.asset}:${icon.group}:${icon.variantIndex ?? 0}` : icon.symbol)).size)
      .toBe(ROUTE_ICONS.length);
  });

  it('gives every semantic icon a useful label', () => {
    expect(Object.values(EDITOR_ICONS).every((icon) => icon.label.trim().length > 0)).toBe(true);
  });

  it('narrows UI symbols without exposing source filenames to editor screens', () => {
    expect(editorUiSymbol('editor.command.undo')).toBe('undo');
    expect(() => editorUiSymbol('editor.route.map')).toThrow(/not a UI symbol/u);
  });
});
