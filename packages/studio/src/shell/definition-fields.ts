import { CanvasTextEditor, ui, type UiElement } from '@orchard/ui';
import type { StudioCanvasToolContext } from './canvas-tool.js';

type FieldValue = string | number | boolean;
interface Field {
  readonly path: readonly (string | number)[];
  readonly value: FieldValue;
  readonly editor: CanvasTextEditor;
  checked: boolean;
}

function fieldsOf(value: unknown, path: readonly (string | number)[] = [], fields: Field[] = []): Field[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    fields.push({ path, value, editor: new CanvasTextEditor({ value: String(value), maxLength: 16_384, multiline: typeof value === 'string' && (value.length > 80 || ['body','summary','description'].includes(String(path.at(-1)))) }), checked: value === true });
  } else if (Array.isArray(value)) {
    value.forEach((entry: unknown, index) => fieldsOf(entry, [...path, index], fields));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) fieldsOf(entry, [...path, key], fields);
  }
  return fields;
}

/** Editable projection of the existing JSON draft. Apply still goes through the
 * route's domain validator; this form cannot publish or bypass its access gate. */
export function studioDefinitionFields(context: StudioCanvasToolContext, options: {
  readonly id: string;
  readonly draft: CanvasTextEditor;
  readonly readOnly: boolean;
  readonly apply: () => void;
}): UiElement {
  const state = context.controller.toolState(`definition-fields:${options.id}`, () => ({
    source: '', fields: [] as Field[], parseError: '', group: 'General',
  }));
  const source = options.draft.snapshot().value;
  if (state.source !== source) {
    state.source = source;
    try { state.fields = fieldsOf(JSON.parse(source)); state.parseError = ''; }
    catch { state.fields = []; state.parseError = source ? 'Fix the JSON syntax to edit these fields.' : 'Select a definition.'; }
  }
  const error = ui.text(state.parseError, { id: `${options.id}:error`, layout: { width: 'grow' } });
  const groupOf=(field:Field)=>field.path.length<2 || ['icon','tags'].includes(String(field.path[0])) ? 'General'
    : typeof field.path[1]==='number' && field.path.length>2 ? `${String(field.path[0])} ${field.path[1]+1}` : String(field.path[0]);
  const groups=[...new Set(state.fields.map(groupOf))];
  const grouped=state.fields.length>12 && groups.length>1;
  if(!groups.includes(state.group))state.group=groups[0]??'General';
  const children = state.fields.flatMap((field, index) => {
    const label = field.path.map(part => typeof part === 'number' ? String(part + 1) : part.replace(/([a-z])([A-Z])/gu, '$1 $2').replaceAll('_', ' ').toLowerCase().replace(/\b(id|npc|ui|json|xp)\b/gu, value => value.toUpperCase())).join(' / ').replace(/^./u, value => value.toUpperCase());
    const immutable = field.path.length === 1 && ['id', 'kind', 'schemaVersion'].includes(String(field.path[0]));
    if (immutable) return [];
    const id = `${options.id}:${index}`;
    const nodes=[typeof field.value === 'boolean'
      ? ui.checkbox({ id, label, value: field.checked, disabled: options.readOnly || immutable,
        onChange: checked => { field.checked = checked; }, layout: { width: 'grow' } })
      : ui.flex({ width: 'grow', gap: 2 }, [ui.text(label), (typeof field.value === 'string' && (field.value.length > 80 || ['body','summary','description'].includes(String(field.path.at(-1))))
        ? ui.textArea({ id, label, editor: field.editor, rows: 5, readOnly: options.readOnly, layout: { width: 'grow', shrink: 0 } })
        : ui.input({ id, label, editor: field.editor, readOnly: options.readOnly || immutable, layout: { width: 'grow' } }))])];
    for(const node of nodes)node.setStyle({visible:!grouped||groupOf(field)===state.group});
    return nodes;
  });
  return ui.flex({ width: 'grow', height: 'grow', gap: 4 }, [
    ...(grouped?[ui.select({id:`${options.id}:group`,label:'Property group',value:state.group,options:groups.map(value=>({value,label:value.replaceAll('_',' ')})),onChange:value=>{state.group=value;context.invalidate();}})]:[]),
    ui.scrollArea({ width: 'grow', height: 'grow', gap: 8, padding: { right: 8 } }, children),
    error,
    ui.button({ id: `${options.id}:apply`, label: 'Apply changes', tone: 'success',
      disabled: options.readOnly || state.fields.length === 0, onPress: () => {
        try {
          const definition = JSON.parse(source) as Record<string, unknown>;
          for (const field of state.fields) {
            const raw = field.editor.snapshot().value;
            const value = typeof field.value === 'boolean' ? field.checked : typeof field.value === 'number' ? Number(raw) : raw;
            if (typeof value === 'number' && (!raw.trim() || !Number.isFinite(value))) throw new Error(`${field.path.join(' / ')} needs a number.`);
            let parent = definition;
            for (const part of field.path.slice(0, -1)) parent = parent[part] as Record<string, unknown>;
            parent[field.path.at(-1)!] = value;
          }
          options.draft.setValue(JSON.stringify(definition, null, 2));
          state.parseError = '';
          options.apply();
          context.invalidate();
        } catch (cause) {
          state.source = options.draft.snapshot().value;
          state.parseError = cause instanceof Error ? cause.message : String(cause);
          error.setProps({ text: state.parseError });
          context.invalidate();
        }
      } }),
  ]);
}
