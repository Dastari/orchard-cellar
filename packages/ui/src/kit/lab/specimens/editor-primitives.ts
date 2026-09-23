import { selectAtlasFrame } from '../../../sprite.js';
import { uiFixed } from '../../layout/box.js';
import type { UiLabSpecimen } from '../registry.js';

/** Editor primitives Studio needs beyond the core controls: a compact layer
 * stack with visibility/lock toggles, drag-capable palette cells with deferred
 * artwork and the confirm selection reticle, and a URL-backed bitmap icon. */
export const editorPrimitivesSpecimen: UiLabSpecimen = {
  id: 'editor-primitives', title: 'Editor layers, palette cells and icons', district: 'patterns',
  size: { width: 420, height: 300 }, matrix: { selected: ['canopy', 'terrain'] },
  build(ui, props, mock) {
    const selected = String(props['selected'] ?? 'canopy');
    mock.requestAsset?.('tile_cf_grass');
    const layers = [
      { id: 'canopy', label: 'Canopy', visible: true, locked: false },
      { id: 'objects', label: 'Objects', visible: true, locked: true },
      { id: 'decals', label: 'Decals', visible: false, locked: false },
      { id: 'terrain', label: 'Terrain', visible: true, locked: false },
    ];
    const layerPanel = ui.frame({ id: 'lab.editor.layers', style: 'thin', header: { title: 'Layers' },
      layout: { width: uiFixed(170), height: uiFixed(layers.length * 16 + 52), shrink: 0 },
      children: [ui.flex({ width: 'grow' }, layers.map(layer => ui.layerRow({
        id: `lab.layer.${layer.id}`, label: layer.label, selected: layer.id === selected, visible: layer.visible, locked: layer.locked,
        onSelect: () => mock.activate(`select:${layer.id}`), onToggleVisible: () => mock.activate(`visible:${layer.id}`),
        onToggleLock: () => mock.activate(`lock:${layer.id}`),
      })))] });
    const grass = () => {
      const asset = mock.assets?.get('tile_cf_grass');
      const frame = asset && selectAtlasFrame(asset.metadata, 'base', 0);
      return asset && frame ? { image: asset.image, frame } : undefined;
    };
    const cell = (id: string, label: string, active: boolean, resolve: () => ReturnType<typeof grass>) =>
      ui.tooltip(label, ui.stack({ width: uiFixed(46), height: uiFixed(46), padding: 2 }, [
        ui.button({ id, label: '', ariaLabel: label, size: 'md', layout: { width: uiFixed(40), height: uiFixed(40), padding: 4 },
          onPress: () => mock.activate(id),
          drag: { onDrop: point => mock.activate(`${id}:drop:${Math.round(point.x)},${Math.round(point.y)}`) },
          children: [ui.deferredImage(resolve, { label })] }),
        ...(active ? [ui.selectionReticle({ inset: 2, outset: 1 })] : []),
      ]), { width: uiFixed(46), height: uiFixed(46) });
    const palette = ui.frame({ id: 'lab.editor.palette', style: 'thin', header: { title: 'Palette' },
      layout: { width: 'grow', height: 'fit', gap: 4 }, children: [
        ui.grid({ columns: 3, columnWidth: uiFixed(46), rowHeight: uiFixed(46), gap: 0, width: 'grow', height: uiFixed(46) }, [
          cell('lab.palette.grass', 'Grass', true, grass),
          cell('lab.palette.pending', 'Loading artwork', false, () => undefined),
          cell('lab.palette.second', 'Grass copy', false, grass),
        ]),
        ui.flex({ direction: 'row', gap: 4, height: uiFixed(32) }, [
          ui.tooltip('Pixel tool icon from a PNG URL', ui.button({ id: 'lab.pixel-tool', label: '', ariaLabel: 'Select tool',
            layout: { width: uiFixed(32), height: uiFixed(32), padding: 4 }, onPress: () => mock.activate('pixel-tool'),
            children: [ui.imageUrl('/studio-icons/select.png', { label: 'Select tool' })] }), { width: uiFixed(32), height: uiFixed(32) }),
          ui.text('URL icons show their fallback until loaded.', { layout: { width: 'grow' } }),
        ]),
      ] });
    return ui.flex({ direction: 'row', gap: 8, width: 'grow', height: 'grow', padding: 8 }, [layerPanel, palette]);
  },
};
