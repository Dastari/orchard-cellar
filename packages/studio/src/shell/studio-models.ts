/** Studio-owned data models. These are plain data, not UI: Studio presents
 * them with `@orchard/ui/studio` kit factories. They moved here from the
 * retired `packages/ui/src/studio` DOM/canvas shell (doc 61 §5). */

export type StudioMode = 'build' | 'author' | 'operate' | 'observe';

export type StudioDockPlacement = 'left' | 'right' | 'bottom' | 'center' | 'overlay';
export type StudioDockId =
  | 'mode_rail' | 'world_outliner' | 'live_outliner' | 'inspector'
  | 'content_browser' | 'asset_library' | 'validation' | 'audit_tail'
  | 'live_sync_log' | 'animation_preview' | 'audio_mixer' | 'telemetry'
  | 'console' | 'behaviour' | 'prefab_instances' | 'history'
  | 'layouts' | 'studio_settings' | 'world_settings' | 'tool_registry'
  | 'search_everywhere' | 'preview' | 'observe';

export type StudioPropertyKind = 'text' | 'number' | 'boolean' | 'select' | 'reference' | 'json' | 'readonly';
export type StudioPropertyValue = string | number | boolean | null;

export interface StudioPropertyInput {
  readonly id: string;
  readonly label: string;
  readonly component: string;
  readonly kind: StudioPropertyKind;
  readonly value: StudioPropertyValue;
  readonly defaultValue?: StudioPropertyValue;
  readonly options?: readonly string[];
  readonly why: string;
  readonly pinned?: boolean;
  readonly readOnly?: boolean;
  readonly error?: string;
  /** Opaque, tool-owned declaration. Models preserve it but never execute a
   * command name; the owning tool must runtime-validate an allowlisted
   * adapter before presenting or invoking a mutation. */
  readonly action?: unknown;
}

export interface StudioPropertyRowModel extends StudioPropertyInput {
  readonly changed: boolean;
  readonly canReset: boolean;
  readonly pinLabel: string;
  readonly resetLabel: string;
}

export interface StudioInspectorGroupModel {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly StudioPropertyRowModel[];
  readonly errorCount: number;
  readonly pinnedCount: number;
}

export function studioPropertyRow(input: StudioPropertyInput): StudioPropertyRowModel {
  if (input.id.length === 0 || input.label.length === 0 || input.component.length === 0) {
    throw new TypeError('Studio property identity must be non-empty');
  }
  if (input.why.trim().length === 0) throw new TypeError(`Studio property ${input.id} requires why help`);
  if (input.kind === 'select' && (input.options === undefined || input.options.length === 0)) {
    throw new TypeError(`Studio select property ${input.id} requires options`);
  }
  const changed = input.defaultValue !== undefined && input.defaultValue !== input.value;
  return Object.freeze({
    ...input,
    changed,
    canReset: changed && input.readOnly !== true,
    pinLabel: input.pinned === true ? `Unpin ${input.label}` : `Pin ${input.label}`,
    resetLabel: `Reset ${input.label} to default`,
  });
}

export function studioInspectorGroups(properties: readonly StudioPropertyInput[]): readonly StudioInspectorGroupModel[] {
  const ids = new Set<string>();
  const groups = new Map<string, StudioPropertyRowModel[]>();
  for (const property of properties) {
    if (ids.has(property.id)) throw new TypeError(`Duplicate Studio property id: ${property.id}`);
    ids.add(property.id);
    const rows = groups.get(property.component) ?? [];
    rows.push(studioPropertyRow(property));
    groups.set(property.component, rows);
  }
  return Object.freeze([...groups].map(([id, rows]) => Object.freeze({
    id,
    label: id.replaceAll('_', ' ').replace(/\b\w/gu, (value) => value.toUpperCase()),
    rows: Object.freeze(rows),
    errorCount: rows.filter(({ error }) => error !== undefined).length,
    pinnedCount: rows.filter(({ pinned }) => pinned === true).length,
  })));
}
