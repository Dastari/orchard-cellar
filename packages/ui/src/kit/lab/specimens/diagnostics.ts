import { selectAtlasFrame } from '../../../sprite.js';
import { uiFixed } from '../../layout/box.js';
import type { UiLayerInspectorOptions } from '../../components/layer-inspector.js';
import type { UiLabSpecimen } from '../registry.js';
export const diagnosticsSpecimen: UiLabSpecimen = {
  id: 'migration-diagnostics', title: 'Diagnostics & Terrain Layers', district: 'migration',
  size: { width: 1200, height: 650 }, closable: false, matrix: { mode: ['normal', 'many', 'hidden'] },
  build(ui, props, mock) {
    const names = ['tile_cf_grass', 'tile_cf_stone_cliff_variants'];
    for (const name of names) mock.requestAsset?.(name);
    const lines = Array.from({ length: 35 }, (_, index) => `METRIC ${index + 1}: ${index * 17} / RENDER AND NETWORK DIAGNOSTIC VALUE`);
    const details = ui.diagnostics({ id: 'lab.diagnostics', title: 'RENDER / NETWORK', lines,
      layout: { width: uiFixed(260), height: 'grow', shrink: 1 } });
    let model: UiLayerInspectorOptions = {
      layers: Array.from({ length: props['mode'] === 'many' ? 12 : 3 }, (_, index) => ({
        id: String(index), label: `${index + 1} ${index === 0 ? 'GROUND' : 'CLIFF'}`, visible: props['mode'] !== 'hidden' || index === 0,
      })), selectedId: null,
      render(context, bounds, id) {
        context.save();
        try {
          for (const layer of model.layers) {
            if (id === null ? !layer.visible : layer.id !== id) continue;
            const index = Number(layer.id), asset = mock.assets?.get(names[index === 0 ? 0 : 1]!);
            if (!asset) continue;
            const source = selectAtlasFrame(asset.metadata, 'base', index === 0 ? 0 : index - 1);
            if (!source) continue;
            context.globalAlpha = layer.visible ? 1 : 0.25;
            context.drawImage(asset.image, source.x, source.y, source.width, source.height,
              bounds.x, bounds.y, bounds.width, bounds.height);
          }
        } finally { context.restore(); }
      },
      onSelect(id) { model = { ...model, selectedId: id }; inspector.updateInspector(model); mock.activate(`layer:${id}`); },
      onVisibility(id, visible) { model = { ...model, layers: model.layers.map(layer => layer.id === id ? { ...layer, visible } : layer) };
        inspector.updateInspector(model); mock.activate(`visibility:${id}:${visible}`); },
    };
    const inspector = ui.layerInspector(model);
    return ui.flex({ direction: 'row', gap: 4, width: 'grow', height: 'grow' }, [details, inspector]);
  },
};
