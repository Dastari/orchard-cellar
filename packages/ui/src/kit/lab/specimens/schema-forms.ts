import { CONTENT_FIELD_SCHEMAS } from '@orchard/sim';
import { UiSchemaFormState } from '../../components/schema-form.js';
import type { UiLabSpecimen } from '../registry.js';

export const schemaFormsSpecimen: UiLabSpecimen = {
  id: 'schema-forms', title: 'Schema forms and typed references', district: 'forms', size: { width: 600, height: 780 },
  build(ui, _props, mock) {
    const state = new UiSchemaFormState({ id: 'recipe:fruit', kind: 'recipe', schemaVersion: 1, recipeKind: 'shapeless', inputs: [], output: { item: 'item:apple', count: 1 } });
    return ui.frame({ header: { title: 'Author a recipe' }, layout: { width: 'grow', height: 'grow', gap: 8, padding: 8 }, children: [
      ui.text('Add ingredients, choose references, or switch to a shaped pattern.', { wrap: true }),
      ui.schemaForm({ id: 'schema-specimen', graph: CONTENT_FIELD_SCHEMAS, schema: CONTENT_FIELD_SCHEMAS.roots.recipe!, state,
        references: [{ id: 'item:apple', kind: 'item', label: 'Apple' }, { id: 'item:pear', kind: 'item', label: 'Pear' }],
        previewReference: () => ui.icon({ cf: 'backpack' }), onOpenReference: id => mock.activate(`open:${id}`),
        onChange: () => mock.activate('form:change'), onApply: () => mock.activate('form:apply'),
      }),
      ui.usedBy({ id: 'schema-used-by', uses: [{ sourceId: 'shop:market', sourceKind: 'shop', path: 'offers[0].item', targetId: 'item:apple' }], onOpen: id => mock.activate(`open:${id}`) }),
    ] });
  },
};
