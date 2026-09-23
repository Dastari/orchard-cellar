import { contentFieldDefault, contentFieldErrors, contentFieldVariant, type ContentFieldSchemaGraph } from '@orchard/sim';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import type { UiElement } from '../runtime/element.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiInput, uiTextArea } from './input.js';
import { uiCheckbox } from './forms.js';
import { uiSelect } from './select.js';
import { uiReferencePicker, type UiContentReference } from './reference-picker.js';

type Path = readonly (string | number)[];
const keyOf = (path: Path) => JSON.stringify(path);
const labelFor = (name: string) => name.replace(/([a-z])([A-Z])/gu, '$1 $2').replaceAll('_', ' ').replace(/^./u, first => first.toUpperCase());
/** Retain this model across host rebuilds. Editors keep unfinished numbers and selection. */
export class UiSchemaFormState {
  value: unknown;
  error = '';
  readonly editors = new Map<string, CanvasTextEditor>();
  readonly numbers = new Map<string, Path>();
  readonly strings = new Map<string, Path>();
  readonly expanded = new Set<string>();
  constructor(value: unknown) { this.value = structuredClone(value); }
  get(path: Path): unknown { return path.reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string | number, unknown>)[part] : undefined, this.value); }
  set(path: Path, value: unknown): void {
    if (!path.length) this.value = value;
    else { const parent = this.get(path.slice(0, -1)) as Record<string | number, unknown>; if (value === undefined) delete parent[path.at(-1)!]; else parent[path.at(-1)!] = value; }
    for (const key of this.editors.keys()) { const editorPath = JSON.parse(key) as Path; if (path.every((part, index) => editorPath[index] === part)) { this.editors.delete(key); this.numbers.delete(key); this.strings.delete(key); } }
    this.error = '';
  }
  editor(path: Path, numeric = false): CanvasTextEditor {
    const key = keyOf(path); let editor = this.editors.get(key);
    if (!editor) { editor = new CanvasTextEditor({ value: String(this.get(path) ?? ''), maxLength: 65536, multiline: !numeric }); this.editors.set(key, editor); }
    if (numeric) this.numbers.set(key, path);
    return editor;
  }
  commitNumbers(): void {
    for (const [key, path] of this.strings) {
      const text = this.editors.get(key)!.snapshot().value;
      if (!path.length) this.value = text; else (this.get(path.slice(0, -1)) as Record<string | number, unknown>)[path.at(-1)!] = text;
    }
    for (const [key, path] of this.numbers) {
      const text = this.editors.get(key)!.snapshot().value;
      if (!text.trim() || !Number.isFinite(Number(text))) throw new Error(`${path.join(' / ')} needs a finite number.`);
      const parent = this.get(path.slice(0, -1)) as Record<string | number, unknown>;
      if (!path.length) this.value = Number(text); else parent[path.at(-1)!] = Number(text);
    }
  }
}
export interface UiSchemaFormOptions {
  readonly id: string; readonly graph: ContentFieldSchemaGraph; readonly schema: string;
  readonly state: UiSchemaFormState; readonly readOnly?: boolean;
  readonly references?: readonly UiContentReference[]; readonly previewReference?: (id: string) => UiElement | undefined;
  readonly onOpenReference?: (id: string) => void; readonly onChange?: () => void;
  readonly onApply: (value: unknown) => void;
}
export function uiSchemaForm(options: UiSchemaFormOptions): UiElement {
  const { state, graph } = options;
  const change = (path: Path, value: unknown) => {
    if (options.readOnly) return;
    try { state.commitNumbers(); state.set(path, value); rebuild(); error.setProps({ text: '' }); options.onChange?.(); }
    catch (cause) { state.error = cause instanceof Error ? cause.message : String(cause); error.setProps({ text: state.error }); }
  };
  const error = uiText(state.error, { id: `${options.id}:error`, wrap: true });
  const action = (id: string, label: string, callback: () => void, disabled = false) => uiButton({ id, label, disabled: options.readOnly || disabled, onPress: () => {
    if (options.readOnly || disabled) return;
    try { callback(); error.setProps({ text: state.error }); } catch (cause) { state.error = cause instanceof Error ? cause.message : String(cause); error.setProps({ text: state.error }); }
  } });
  const render = (schemaId: string, path: Path, label: string, depth = 0, ungrouped = false): UiElement => {
    const schema = graph.nodes[schemaId]!; const value = state.get(path); const id = `${options.id}:${path.join('.')}`;
    if (depth > 40) return uiText('Nesting limit reached; use the advanced JSON editor.');
    const child = (childId: string, childPath: Path, title: string) => render(childId, childPath, title, depth + 1, childPath.length === path.length);
    const grouped = !ungrouped && ((schema.type === 'array' && Array.isArray(value) && value.length > 4) || (schema.type === 'object' && path.length > 1));
    if (grouped) {
      const expanded = state.expanded.has(keyOf(path));
      return uiFlex({ width: 'grow', gap: 4 }, [uiButton({ id: `${id}:expand`, label: `${expanded ? 'Hide' : 'Show'} ${label}`, onPress: () => {
        if (expanded) state.expanded.delete(keyOf(path)); else state.expanded.add(keyOf(path)); rebuild();
      } }), ...(expanded ? [render(schemaId, path, label, depth, true)] : [])]);
    }
    if (schema.type === 'union') {
      const literals = schema.options.map(option => graph.nodes[option]!);
      if (literals.every(node => node.type === 'literal')) return uiFlex({ width: 'grow', gap: 2 }, [uiText(label), uiSelect({ id, label, value: JSON.stringify(value), disabled: options.readOnly,
        options: literals.map(node => ({ value: JSON.stringify(node.value), label: String(node.value) })), onChange: next => change(path, JSON.parse(next)) })]);
      const selected = contentFieldVariant(graph, schema.options, value);
      const variantLabel = (variant: string, index: number) => {
        const node = graph.nodes[variant]!;
        if (node.type === 'literal') return String(node.value);
        if (node.type !== 'object') return node.type;
        return Object.entries(node.fields).filter(([key, field]) => !['kind','schemaVersion'].includes(key) && graph.nodes[field.schema]?.type === 'literal').map(([key, field]) => `${key}: ${String((graph.nodes[field.schema] as { value: unknown }).value)}`).join(', ') || Object.keys(node.fields).filter(key => !['id','kind','schemaVersion'].includes(key)).slice(0, 3).join(', ') || `Variant ${index + 1}`;
      };
      return uiFlex({ width: 'grow', gap: 4 }, [uiSelect({ id: `${id}:variant`, label: `${label} variant`, value: selected, disabled: options.readOnly,
        options: schema.options.map((option, index) => ({ value: option, label: variantLabel(option, index) })), onChange: next => {
          try { state.commitNumbers(); } catch (cause) { state.error = cause instanceof Error ? cause.message : String(cause); error.setProps({ text: state.error }); return; }
          const initial = contentFieldDefault(graph, next);
          // Keep only fields compatible with the new variant; retain stable identity.
          if (initial && value && typeof initial === 'object' && typeof value === 'object' && !Array.isArray(initial)) {
            const node = graph.nodes[next];
            if (node?.type === 'object') for (const [key, field] of Object.entries(node.fields)) {
              const previous = (value as Record<string, unknown>)[key];
              if (previous !== undefined && contentFieldErrors(graph, field.schema, previous).length === 0) (initial as Record<string, unknown>)[key] = structuredClone(previous);
            }
          }
          change(path, initial);
        } }), child(selected, path, label)]);
    }
    if (schema.type === 'literal') return uiText(`${label}: ${String(schema.value)}`);
    if (schema.type === 'boolean') return uiCheckbox({ id, label, value: value === true, disabled: options.readOnly, onChange: checked => change(path, checked) });
    if (schema.type === 'string' && schema.reference) return uiReferencePicker({ id, label, kind: schema.reference, value: String(value ?? ''), choices: options.references ?? [], disabled: options.readOnly,
      editor: state.editor(path), preview: options.previewReference, onOpen: options.onOpenReference, onChange: next => change(path, next) });
    if (schema.type === 'string' || schema.type === 'number') {
      const editor = state.editor(path, schema.type === 'number');
      if (schema.type === 'string') state.strings.set(keyOf(path), path);
      const props = { id, label, editor, readOnly: options.readOnly, layout: { width: 'grow' as const }, onChange: (text: string) => {
        if (options.readOnly || schema.type === 'number') return;
        const parent = state.get(path.slice(0, -1)) as Record<string | number, unknown>;
        if (!path.length) state.value = text; else parent[path.at(-1)!] = text;
      } };
      return uiFlex({ width: 'grow', gap: 2 }, [uiText(label), schema.type === 'string' && (['body','summary','description','text'].includes(String(path.at(-1))) || String(value).length > 100) ? uiTextArea({ ...props, rows: 4 }) : uiInput(props)]);
    }
    if (schema.type === 'array') {
      const entries = Array.isArray(value) ? value : [];
      return uiArrayEditor({ id, label, values: entries, readOnly: options.readOnly,
        create: () => contentFieldDefault(graph, schema.items), beforeChange: () => state.commitNumbers(),
        render: (_entry, index) => child(schema.items, [...path, index], `${label} ${index + 1}`),
        onChange: next => change(path, next), onError: message => { state.error = message; error.setProps({ text: message }); },
      });
    }
    if (schema.type === 'tuple') {
      const entries = Array.isArray(value) ? value : [];
      return uiFlex({ width: 'grow', gap: 4 }, [uiText(`${label} (${entries.length})`),
        ...entries.map((_entry: unknown, index) => child((schema.items[index] ?? schema.rest)!, [...path, index], `${label} ${index + 1}`)),
        ...(entries.length < schema.items.length || schema.rest ? [action(`${id}:add`, `Add ${label}`, () => { state.commitNumbers(); change(path, [...entries, contentFieldDefault(graph, (schema.items[entries.length] ?? schema.rest)!)]); })] : []),
        ...(entries.length > (schema.minItems ?? schema.items.length) ? [action(`${id}:remove-last`, 'Remove last optional entry', () => { state.commitNumbers(); change(path, entries.slice(0, -1)); })] : []),
      ]);
    }
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const fields = Object.entries(schema.fields);
    const extra = schema.additional ? Object.keys(record).filter(key => !schema.fields[key]).map(key => [key, { schema: schema.additional!, optional: true }] as const) : [];
    return uiFlex({ width: 'grow', gap: 8 }, [
      ...(path.length ? [uiText(label)] : []),
      ...[...fields, ...extra].filter(([key]) => path.length !== 0 || !['id','kind','schemaVersion'].includes(key)).map(([key, field]) => {
        const childPath = [...path, key]; const childId = `${options.id}:${childPath.join('.')}`;
        const title = `${labelFor(key)}${'unit' in field && field.unit ? ` (${field.unit})` : ''}`;
        return uiFlex({ width: 'grow', gap: 2 }, [
          ...(!schema.fields[key] ? [uiInput({ id: `${childId}:key`, label: 'Entry key (Enter to rename)', value: key, readOnly: options.readOnly, onSubmit: name => {
            if (options.readOnly || !name || name === key || Object.hasOwn(record, name)) return;
            try { state.commitNumbers(); const next = { ...record, [name]: record[key] }; delete next[key]; change(path, next); }
            catch (cause) { state.error = cause instanceof Error ? cause.message : String(cause); error.setProps({ text: state.error }); }
          } })] : []),
          ...('help' in field && field.help ? [uiText(field.help, { wrap: true })] : []),
          ...(record[key] === undefined ? [action(`${childId}:add`, `Add ${title}`, () => change(childPath, contentFieldDefault(graph, field.schema)))] : [child(field.schema, childPath, title), ...(field.optional ? [action(`${childId}:remove`, `Remove ${title}`, () => change(childPath, undefined))] : [])]),
        ]);
      }),
      ...(schema.additional ? [action(`${id}:add-property`, 'Add entry', () => { let i = 1; while (Object.hasOwn(record, `entry_${i}`)) i++; change([...path, `entry_${i}`], contentFieldDefault(graph, schema.additional!)); })] : []),
    ]);
  };
  const fields = uiScrollArea({ width: 'grow', height: 'grow', gap: 8, padding: { right: 8 } }, []);
  const rebuild = () => fields.replaceChildren([render(options.schema, [], 'Definition')]);
  rebuild();
  return uiFlex({ width: 'grow', height: 'grow', gap: 4 }, [fields, error,
    action(`${options.id}:apply`, 'Apply changes', () => {
      state.commitNumbers();
      const errors = contentFieldErrors(graph, options.schema, state.value);
      if (errors.length) throw new Error(errors[0]);
      options.onApply(structuredClone(state.value)); state.error = '';
    }),
  ]);
}

/** Controlled array editor shared by schema forms and custom authoring layouts. */
export function uiArrayEditor<T>(options: {
  readonly id: string; readonly label: string; readonly values: readonly T[]; readonly readOnly?: boolean;
  readonly render: (value: T, index: number) => UiElement; readonly create: () => T;
  readonly beforeChange?: () => void; readonly onChange: (values: readonly T[]) => void; readonly onError?: (message: string) => void;
}): UiElement {
  const action = (suffix: string, label: string, update: (values: T[]) => T[], disabled = false) => uiButton({
    id: `${options.id}:${suffix}`, label, disabled: options.readOnly || disabled, onPress: () => {
      if (options.readOnly || disabled) return;
      try { options.beforeChange?.(); options.onChange(update([...options.values])); }
      catch (cause) { options.onError?.(cause instanceof Error ? cause.message : String(cause)); }
    },
  });
  return uiFlex({ width: 'grow', gap: 4 }, [uiText(`${options.label} (${options.values.length})`),
    ...options.values.map((value, index) => uiFlex({ width: 'grow', gap: 4, padding: { left: 4 } }, [options.render(value, index),
      uiFlex({ direction: 'row', wrap: true, gap: 2 }, [
        action(`${index}:remove`, 'Remove', values => values.filter((_, i) => i !== index)),
        action(`${index}:up`, 'Up', values => { [values[index - 1], values[index]] = [values[index]!, values[index - 1]!]; return values; }, index === 0),
        action(`${index}:down`, 'Down', values => { [values[index + 1], values[index]] = [values[index]!, values[index + 1]!]; return values; }, index === options.values.length - 1),
      ]),
    ])), action('add', `Add ${options.label}`, values => [...values, options.create()]),
  ]);
}
