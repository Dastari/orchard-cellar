import { CONTENT_FIELD_SCHEMAS, contentReferenceIndex, type SupportedContentDefinition, type SupportedContentKind } from '@orchard/sim';
import { CanvasTextEditor, ui, uiFixed, uiSchemaForm, uiUsedBy, UiSchemaFormState, type UiElement } from '@orchard/ui/studio';
import type { StudioCanvasToolContext } from './canvas-tool.js';
import { openStudioDefinition } from './content-navigation.js';
import { studioDefinitionPreview } from './definition-preview.js';

/** A schema-backed draft projection. Apply uses the host's existing domain validator. */
export function studioDefinitionFields(context: StudioCanvasToolContext, options: {
  readonly id: string; readonly draft: CanvasTextEditor; readonly readOnly: boolean;
  readonly definitions?: readonly SupportedContentDefinition[]; readonly apply: () => void;
}): UiElement {
  const retained = context.controller.toolState(`definition-fields:${options.id}`, () => ({ source: '', form: null as UiSchemaFormState | null, parseError: '' }));
  const source = options.draft.snapshot().value;
  if (retained.source !== source || retained.form === null) {
    retained.source = source;
    try { retained.form = new UiSchemaFormState(JSON.parse(source)); retained.parseError = ''; }
    catch { retained.form = null; retained.parseError = source ? 'Fix the advanced JSON syntax to edit these fields.' : 'Select a definition.'; }
  }
  if (!retained.form) return ui.text(retained.parseError, { id: `${options.id}:error`, wrap: true });
  const value = retained.form.value as { kind?: SupportedContentKind; id?: string };
  const schema = value?.kind ? CONTENT_FIELD_SCHEMAS.roots[value.kind] : undefined;
  if (!schema) return ui.text('This draft needs a supported content kind. Repair it in advanced JSON.', { id: `${options.id}:error`, wrap: true });
  const definitions = options.definitions ?? [];
  const references = definitions.map(definition => ({ id: definition.id, kind: definition.kind,
    label: 'displayName' in definition ? String(definition.displayName) : 'title' in definition ? String(definition.title) : definition.id }));
  const open = (id: string) => { openStudioDefinition(context.controller, id); context.invalidate(); };
  const index = contentReferenceIndex(CONTENT_FIELD_SCHEMAS, definitions);
  return ui.flex({ width: 'grow', height: 'grow', gap: 4 }, [
    uiSchemaForm({ id: options.id, graph: CONTENT_FIELD_SCHEMAS, schema, state: retained.form, readOnly: options.readOnly,
      references, onOpenReference: open, previewReference: id => {
        const definition = definitions.find(entry => entry.id === id);
        if (!definition) return undefined;
        const preview = studioDefinitionPreview(context, definition); preview.setStyle({ height: uiFixed(96), shrink: 0 }); return preview;
      },
      onApply: next => {
        const previous = options.draft.snapshot().value;
        options.draft.setValue(JSON.stringify(next, null, 2));
        try { options.apply(); retained.source = options.draft.snapshot().value; context.invalidate(); }
        catch (cause) { options.draft.setValue(previous); throw cause; }
      },
    }),
    ui.scrollArea({ width: 'grow', maxHeight: uiFixed(120), gap: 4 }, [uiUsedBy({ id: `${options.id}:used-by`, uses: index.get(value.id ?? '') ?? [], onOpen: open })]),
  ]);
}
