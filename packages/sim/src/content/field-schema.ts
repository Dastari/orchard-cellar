import type { SupportedContentKind } from './definitions.js';
export interface ContentField { readonly schema: string; readonly optional?: boolean; readonly help?: string; readonly unit?: string }
export type ContentFieldSchema =
  | { readonly type: 'string'; readonly reference?: string }
  | { readonly type: 'number' }
  | { readonly type: 'boolean' }
  | { readonly type: 'literal'; readonly value: string | number | boolean | null }
  | { readonly type: 'union'; readonly options: readonly string[] }
  | { readonly type: 'array'; readonly items: string }
  | { readonly type: 'tuple'; readonly items: readonly string[]; readonly minItems?: number; readonly rest?: string }
  | { readonly type: 'object'; readonly fields: Readonly<Record<string, ContentField>>; readonly additional?: string };
export interface ContentFieldSchemaGraph { readonly roots: Readonly<Partial<Record<SupportedContentKind, string>>>; readonly nodes: Readonly<Record<string, ContentFieldSchema>> }
export { CONTENT_FIELD_SCHEMAS } from './generated-field-schemas.js';

/** Structural check only. Domain parsers remain the authority for bounds and semantics. */
export function contentFieldErrors(graph: ContentFieldSchemaGraph, id: string, value: unknown, path = '$', depth = 0): string[] {
  if (depth > 100) return [`${path}: structure exceeds 100 levels`];
  const schema = graph.nodes[id];
  if (!schema) return [`${path}: unknown schema ${id}`];
  const check = (child: string, entry: unknown, part: string) => contentFieldErrors(graph, child, entry, `${path}${part}`, depth + 1);
  switch (schema.type) {
    case 'literal': return value === schema.value ? [] : [`${path}: expected ${JSON.stringify(schema.value)}`];
    case 'string': return typeof value === 'string' && (!schema.reference || value.startsWith(`${schema.reference}:`)) ? [] : [`${path}: expected ${schema.reference ? `${schema.reference} reference` : 'text'}`];
    case 'number': return typeof value === 'number' && Number.isFinite(value) ? [] : [`${path}: expected finite number`];
    case 'boolean': return typeof value === 'boolean' ? [] : [`${path}: expected boolean`];
    case 'union': return schema.options.some(option => check(option, value, '').length === 0) ? [] : [`${path}: does not match any allowed variant`];
    case 'array': return Array.isArray(value) ? value.flatMap((entry: unknown, index) => check(schema.items, entry, `[${index}]`)) : [`${path}: expected array`];
    case 'tuple': return Array.isArray(value) && value.length >= (schema.minItems ?? schema.items.length) && (schema.rest !== undefined || value.length <= schema.items.length) ? value.flatMap((entry: unknown, index) => check(schema.items[index] ?? schema.rest!, entry, `[${index}]`)) : [`${path}: expected ${schema.items.length} tuple entries`];
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${path}: expected object`];
      const record = value as Record<string, unknown>;
      return [
        ...Object.entries(schema.fields).flatMap(([key, field]) => record[key] === undefined && field.optional ? [] : check(field.schema, record[key], `.${key}`)),
        ...Object.entries(record).flatMap(([key, entry]) => !schema.fields[key] && schema.additional ? check(schema.additional, entry, `.${key}`) : []),
      ];
    }
  }
}

export function contentFieldDefault(graph: ContentFieldSchemaGraph, id: string, ancestors: readonly string[] = []): unknown {
  if (ancestors.includes(id)) return undefined;
  const schema = graph.nodes[id];
  const child = (key: string) => contentFieldDefault(graph, key, [...ancestors, id]);
  if (!schema) return undefined;
  switch (schema.type) {
    case 'literal': return schema.value;
    case 'string': return schema.reference ? `${schema.reference}:` : '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'tuple': return schema.items.slice(0, schema.minItems ?? schema.items.length).map(child);
    case 'union': return child(schema.options[0]!);
    case 'object': return Object.fromEntries(Object.entries(schema.fields).filter(([, field]) => !field.optional).map(([key, field]) => [key, child(field.schema)]));
  }
}

/** Select by full structure, then discriminant, preserving invalid drafts for repair. */
export function contentFieldVariant(graph: ContentFieldSchemaGraph, options: readonly string[], value: unknown): string {
  const match = options.find(id => contentFieldErrors(graph, id, value).length === 0);
  if (match) return match;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const discriminant = options.find(id => {
      const schema = graph.nodes[id];
      return schema?.type === 'object' && Object.entries(schema.fields).some(([key, field]) => {
        const node = graph.nodes[field.schema];
        return key !== 'schemaVersion' && key !== 'kind' && node?.type === 'literal' && record[key] === node.value;
      });
    });
    if (discriminant) return discriminant;
    const shape = options.map(id => {
      const schema = graph.nodes[id];
      return { id, score: schema?.type === 'object' ? Object.keys(schema.fields).filter(key => !['id', 'kind', 'schemaVersion'].includes(key) && Object.hasOwn(record, key)).length : -1 };
    }).sort((a, b) => b.score - a.score)[0];
    if (shape && shape.score > 0) return shape.id;
  }
  if (Array.isArray(value)) {
    const shape = options.find(id => { const schema = graph.nodes[id]; return schema?.type === 'array' || schema?.type === 'tuple' && value.length >= (schema.minItems ?? schema.items.length) && (schema.rest !== undefined || value.length <= schema.items.length); });
    if (shape) return shape;
  }
  return options[0]!;
}

export interface ContentReferenceUse { readonly sourceId: string; readonly sourceKind: string; readonly path: string; readonly targetId: string }
/** Only declared reference fields count. IDs and prose containing IDs are not edges. */
export function contentReferenceIndex(graph: ContentFieldSchemaGraph, definitions: Iterable<{ readonly id: string; readonly kind: string }>): ReadonlyMap<string, readonly ContentReferenceUse[]> {
  const index = new Map<string, ContentReferenceUse[]>();
  for (const definition of definitions) {
    const root = graph.roots[definition.kind as SupportedContentKind];
    if (!root) continue;
    const walk = (id: string, value: unknown, path: string, depth: number): void => {
      if (depth > 100) return;
      const schema = graph.nodes[id]; if (!schema) return;
      if (schema.type === 'string' && schema.reference && typeof value === 'string' && path !== 'id') {
        const uses = index.get(value) ?? []; uses.push({ sourceId: definition.id, sourceKind: definition.kind, path, targetId: value }); index.set(value, uses);
      } else if (schema.type === 'union') walk(contentFieldVariant(graph, schema.options, value), value, path, depth + 1);
      else if ((schema.type === 'array' || schema.type === 'tuple') && Array.isArray(value)) value.forEach((entry: unknown, i) => { const child = schema.type === 'array' ? schema.items : schema.items[i] ?? schema.rest; if (child) walk(child, entry, `${path}[${i}]`, depth + 1); });
      else if (schema.type === 'object' && value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) {
        const child = schema.fields[key]?.schema ?? schema.additional; if (child) walk(child, entry, path ? `${path}.${key}` : key, depth + 1);
      }
    };
    walk(root, definition, '', 0);
  }
  return index;
}
