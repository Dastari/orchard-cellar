import { bootstrapContentDefinitions, type FrameContentDefinition } from '@orchard/sim';
import { createUiFrameDesignerModel } from '../../runtime/frame-designer.js';
import { uiLabInventory } from '../inventory-mock.js';
import type { UiLabSpecimen } from '../registry.js';
export const frameDesignerSpecimen: UiLabSpecimen = {
  id: 'frame-designer', title: 'Frame Designer', district: 'frame-designer', size: { width: 1440, height: 1200 },
  build(ui, _props, mock) {
    const definitions = bootstrapContentDefinitions(), frames = definitions.filter((definition): definition is FrameContentDefinition => definition.kind === 'frame');
    const { controller, artwork } = uiLabInventory(mock);
    return ui.frameDesigner({ definitions: mock.frameDefinitions ?? frames, createModel: mock.createFrameDesigner ?? (definition => createUiFrameDesignerModel({ definition, definitions, access: 'anonymous' })),
      preview: { aliases: { entity: 'entity', backpack: 'backpack', hotbar: 'hotbar', equipment: 'equipment', crafting: 'crafting', merchant: 'merchant' }, controller, artwork,
        registry: { items: new Map(definitions.filter(definition => definition.kind === 'item').map(definition => [definition.id, definition])), processes: new Map(definitions.filter(definition => definition.kind === 'process').map(definition => [definition.id, definition])) } },
      previewFor: definition => {
        const aliases = { entity: 'entity', backpack: 'backpack', hotbar: 'hotbar', equipment: 'equipment', crafting: 'crafting', merchant: 'merchant' };
        const registry = { items: new Map(definitions.filter(definition => definition.kind === 'item').map(definition => [definition.id, definition])), processes: new Map(definitions.filter(definition => definition.kind === 'process').map(definition => [definition.id, definition])) };
        const { controller, artwork } = uiLabInventory(mock, undefined, false, { definition, aliases, registry });
        return { aliases, registry, controller, artwork };
      },
      onAction: mock.activate,
    });
  },
};
