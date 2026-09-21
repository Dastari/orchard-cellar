import { expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiLayerInspector } from './layer-inspector.js';

it('keeps layer actions keyboard reachable and applies current authority without rebuilding controls', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(240, 200);
  const onSelect = vi.fn(), onVisibility = vi.fn();
  const model = { layers: Array.from({ length: 12 }, (_, index) => ({ id: String(index), label: `LAYER ${index + 1}`, visible: true })),
    selectedId: null as string | null, render: vi.fn(), onSelect, onVisibility };
  const inspector = uiLayerInspector(model); root.mount(inspector); root.arrange();
  const select = root.entries().find(entry => entry.element.id === 'layer-inspector.select.11')!.element;
  root.focus.set(select); root.arrange();
  expect(select.clip.height).toBeGreaterThan(0);
  expect(root.key({ key: 'Enter' })).toBe(true); expect(onSelect).toHaveBeenLastCalledWith('11');
  inspector.updateInspector({ ...model, selectedId: '11' }); root.arrange();
  expect(root.focus.current).toBe(select); expect(select.props['tone']).toBe('primary');
  const visibility = root.entries().find(entry => entry.element.id === 'layer-inspector.visibility.11')!.element;
  root.focus.set(visibility); root.key({ key: 'Enter' }); expect(onVisibility).toHaveBeenLastCalledWith('11', false);
  inspector.updateInspector({ ...model, layers: model.layers.map(layer => ({ ...layer, visible: false })) });
  root.key({ key: 'Enter' }); expect(onVisibility).toHaveBeenLastCalledWith('11', true);
  for (const { element } of root.entries()) {
    if (element.clip.width <= 0 || element.clip.height <= 0) continue;
    expect(element.clip.x).toBeGreaterThanOrEqual(0); expect(element.clip.y).toBeGreaterThanOrEqual(0);
    expect(element.clip.x + element.clip.width).toBeLessThanOrEqual(240);
    expect(element.clip.y + element.clip.height).toBeLessThanOrEqual(200);
  }
  inspector.updateInspector({ ...model, layers: [] }); root.arrange();
  expect(root.entries().some(entry => entry.element === select)).toBe(false);
  expect(root.focus.current).toBeNull(); root.dispose();
});

it('wraps controls below previews when the inspector is narrow', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(150, 240);
  const inspector = uiLayerInspector({ layers: [{ id: 'ground', label: '1 GROUND', visible: true }],
    selectedId: null, render: vi.fn(), onSelect: vi.fn(), onVisibility: vi.fn() });
  root.mount(inspector); root.arrange();
  const button = root.entries().find(entry => entry.element.id === 'layer-inspector.select.ground')!.element;
  const preview = root.entries().find(entry => entry.element.id === 'layer-inspector.preview.ground')!.element;
  expect(button.rect.width).toBeGreaterThanOrEqual(88);
  expect(button.rect.y).toBeGreaterThanOrEqual(preview.rect.y + preview.rect.height);
  root.focus.set(button); root.arrange(); expect(button.clip.height).toBe(button.rect.height);
  root.dispose();
});
