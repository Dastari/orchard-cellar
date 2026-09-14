export const FRAME_SCHEMA_VERSION = 1 as const;

import type { FrameDefinitionId } from './object-definition.js';
export type { FrameDefinitionId } from './object-definition.js';
export type FrameStyle = 'wood_parchment' | 'wood' | 'parchment';
export type FramePaneKind = 'slots' | 'bar' | 'label' | 'recipe_list' | 'paper_doll' | 'tabs' | 'text' | 'button_row';
export type FrameSelfBinding = 'backpack' | 'hotbar' | 'equipment' | 'crafting';
export type FrameSurface = 'inventory' | 'crafting' | 'entity' | 'merchant';
export type FrameEntityContainer = 'chest' | 'placeable' | 'stash';

export interface FrameVisibilityPredicate {
  readonly state: string;
  readonly equals: boolean | string | number;
}

export interface FramePresentationDefinition {
  /** Selects the client surface without coupling presentation to the frame id. */
  readonly surface: FrameSurface;
  /** Client custody channel used by entitySlots. This does not grant write authority. */
  readonly entityContainer?: FrameEntityContainer;
}

export type FrameBinding =
  | { readonly self: FrameSelfBinding }
  | { readonly entitySlots: readonly number[] }
  | { readonly process: 'progress' }
  | { readonly state: string }
  | { readonly merchant: 'offers' }
  | { readonly recipeFilter: { readonly process?: `process:${string}`; readonly stationTag?: string } };

export interface FrameAcceptedFromProcess {
  readonly process?: `process:${string}`;
  readonly stationTag?: string;
  readonly role: 'input' | 'fuel' | 'output';
}

export interface FrameSlotRestriction {
  readonly readOnly?: boolean;
  readonly requiredTags?: readonly string[];
  readonly acceptedItems?: readonly `item:${string}`[];
  readonly acceptedFrom?: FrameAcceptedFromProcess;
}

export interface FramePaneDefinition {
  readonly id: string;
  readonly kind: FramePaneKind;
  readonly label?: string;
  readonly columns?: number;
  readonly rows?: number;
  readonly sizing?: 'fixed' | 'flex';
  readonly alignment?: 'start' | 'center' | 'end';
  readonly style?: 'slots' | 'wood' | 'parchment';
  readonly minWidth?: number;
  readonly bind: FrameBinding;
  readonly restriction?: FrameSlotRestriction;
  readonly visibleWhen?: FrameVisibilityPredicate;
}

export interface FrameButtonDefinition {
  readonly label: string;
  readonly interaction: string;
  /** Reviewed bounded callback binding; frame ids never grant this capability. */
  readonly onInvoke?:
    | { readonly claimProcessJob: 'collect' | 'cancel' }
    | { readonly sealContainer: true };
  readonly tone?: 'default' | 'success' | 'danger';
  readonly visibleWhen?: FrameVisibilityPredicate;
}

export interface FrameContentDefinition {
  readonly id: FrameDefinitionId;
  readonly kind: 'frame';
  readonly schemaVersion: typeof FRAME_SCHEMA_VERSION;
  readonly title: string;
  readonly style: FrameStyle;
  /** Optional for schema-v1 continuity. New/edited content should author it;
   * clients without it stay on the legacy, non-authoritative fallback. */
  readonly presentation?: FramePresentationDefinition;
  readonly resizable?: boolean;
  readonly preferredWidth?: number;
  readonly panes: readonly FramePaneDefinition[];
  readonly buttons?: readonly FrameButtonDefinition[];
  readonly hotbar?: { readonly label?: string };
  readonly retired?: boolean;
  readonly replacement?: FrameDefinitionId;
}

const ID_PATTERN = /^frame:[a-z0-9]+(?:_[a-z0-9]+)*$/;
const REFERENCE_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const PANE_KINDS = new Set<FramePaneKind>(['slots', 'bar', 'label', 'recipe_list', 'paper_doll', 'tabs', 'text', 'button_row']);
const FRAME_STYLES = new Set<FrameStyle>(['wood_parchment', 'wood', 'parchment']);
const FRAME_SURFACES = new Set<FrameSurface>(['inventory', 'crafting', 'entity', 'merchant']);

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${path}: expected non-empty string`);
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${path}: expected integer >= ${minimum}`);
  return Number(value);
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path}: expected boolean`);
  return value;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  return value;
}

function reference(value: unknown, path: string): string {
  const result = text(value, path);
  if (!REFERENCE_PATTERN.test(result)) throw new Error(`${path}: invalid stable reference`);
  return result;
}

function stateReference(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^[a-z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)*$/u.test(result)) {
    throw new Error(`${path}: invalid state reference`);
  }
  return result;
}

function parseBinding(value: unknown, path: string): FrameBinding {
  const source = record(value, path);
  const keys = ['self', 'entitySlots', 'process', 'state', 'merchant', 'recipeFilter']
    .filter((key) => source[key] !== undefined);
  if (keys.length !== 1) throw new Error(`${path}: expected exactly one binding`);
  if (source.self !== undefined) {
    const self = text(source.self, `${path}.self`);
    if (!['backpack', 'hotbar', 'equipment', 'crafting'].includes(self)) throw new Error(`${path}.self: unsupported binding`);
    return { self: self as FrameSelfBinding };
  }
  if (source.entitySlots !== undefined) {
    const entitySlots = array(source.entitySlots, `${path}.entitySlots`)
      .map((slot, index) => integer(slot, `${path}.entitySlots[${index}]`));
    if (entitySlots.length === 0 || new Set(entitySlots).size !== entitySlots.length) {
      throw new Error(`${path}.entitySlots: expected unique slots`);
    }
    return { entitySlots };
  }
  if (source.process !== undefined) {
    if (source.process !== 'progress') throw new Error(`${path}.process: unsupported binding`);
    return { process: 'progress' };
  }
  if (source.state !== undefined) return { state: stateReference(source.state, `${path}.state`) };
  if (source.merchant !== undefined) {
    if (source.merchant !== 'offers') throw new Error(`${path}.merchant: unsupported binding`);
    return { merchant: 'offers' };
  }
  const filter = record(source.recipeFilter, `${path}.recipeFilter`);
  if (filter.process === undefined && filter.stationTag === undefined) {
    throw new Error(`${path}.recipeFilter: process or stationTag required`);
  }
  return { recipeFilter: {
    ...(filter.process === undefined ? {} : { process: text(filter.process, `${path}.recipeFilter.process`) as `process:${string}` }),
    ...(filter.stationTag === undefined ? {} : { stationTag: reference(filter.stationTag, `${path}.recipeFilter.stationTag`) }),
  } };
}

function parseRestriction(value: unknown, path: string): FrameSlotRestriction {
  const source = record(value, path);
  const acceptedFrom = source.acceptedFrom === undefined ? undefined : record(source.acceptedFrom, `${path}.acceptedFrom`);
  const role = acceptedFrom === undefined ? undefined : text(acceptedFrom.role, `${path}.acceptedFrom.role`);
  if (role !== undefined && !['input', 'fuel', 'output'].includes(role)) throw new Error(`${path}.acceptedFrom.role: unsupported role`);
  return {
    ...(source.readOnly === undefined ? {} : { readOnly: boolean(source.readOnly, `${path}.readOnly`) }),
    ...(source.requiredTags === undefined ? {} : { requiredTags: array(source.requiredTags, `${path}.requiredTags`)
      .map((tag, index) => reference(tag, `${path}.requiredTags[${index}]`)) }),
    ...(source.acceptedItems === undefined ? {} : { acceptedItems: array(source.acceptedItems, `${path}.acceptedItems`)
      .map((item, index) => text(item, `${path}.acceptedItems[${index}]`) as `item:${string}`) }),
    ...(acceptedFrom === undefined ? {} : { acceptedFrom: {
      ...(acceptedFrom.process === undefined ? {} : { process: text(acceptedFrom.process, `${path}.acceptedFrom.process`) as `process:${string}` }),
      ...(acceptedFrom.stationTag === undefined ? {} : { stationTag: reference(acceptedFrom.stationTag, `${path}.acceptedFrom.stationTag`) }),
      role: role as FrameAcceptedFromProcess['role'],
    } }),
  };
}

function parseVisibility(value: unknown, path: string): FrameVisibilityPredicate {
  const source = record(value, path);
  const equals = source.equals;
  if (typeof equals !== 'boolean' && typeof equals !== 'string'
    && !(typeof equals === 'number' && Number.isSafeInteger(equals))) {
    throw new Error(`${path}.equals: expected boolean, string, or safe integer`);
  }
  return { state: stateReference(source.state, `${path}.state`), equals };
}

function parseOnInvoke(value: unknown, path: string): NonNullable<FrameButtonDefinition['onInvoke']> {
  const source = record(value, path);
  if (Object.keys(source).length !== 1) {
    throw new Error(`${path}: expected exactly one bounded callback`);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'claimProcessJob')
    && (source.claimProcessJob === 'collect' || source.claimProcessJob === 'cancel')) {
    return Object.freeze({ claimProcessJob: source.claimProcessJob });
  }
  if (Object.prototype.hasOwnProperty.call(source, 'sealContainer') && source.sealContainer === true) {
    return Object.freeze({ sealContainer: true });
  }
  throw new Error(`${path}: unsupported bounded callback`);
}

export function parseFrameDefinition(json: string | unknown): FrameContentDefinition {
  const decoded = typeof json === 'string' ? JSON.parse(json) as unknown : json;
  const source = record(decoded, '$');
  if (source.schemaVersion !== FRAME_SCHEMA_VERSION) throw new Error('$.schemaVersion: unsupported frame schema version');
  if (source.kind !== undefined && source.kind !== 'frame') throw new Error('$.kind: expected frame');
  const id = text(source.id, '$.id');
  if (!ID_PATTERN.test(id)) throw new Error('$.id: invalid frame id');
  const style = text(source.style, '$.style');
  if (!FRAME_STYLES.has(style as FrameStyle)) throw new Error('$.style: unsupported frame style');
  const panes = array(source.panes, '$.panes').map((value, index): FramePaneDefinition => {
    const path = `$.panes[${index}]`;
    const pane = record(value, path);
    const kind = text(pane.kind, `${path}.kind`);
    if (!PANE_KINDS.has(kind as FramePaneKind)) throw new Error(`${path}.kind: unsupported pane kind`);
    const columns = pane.columns === undefined ? undefined : integer(pane.columns, `${path}.columns`, 1);
    const rows = pane.rows === undefined ? undefined : integer(pane.rows, `${path}.rows`, 1);
    if ((kind === 'slots' || kind === 'paper_doll') && (columns === undefined || rows === undefined)) {
      throw new Error(`${path}: slot panes require columns and rows`);
    }
    return {
      id: reference(pane.id, `${path}.id`),
      kind: kind as FramePaneKind,
      ...(pane.label === undefined ? {} : { label: text(pane.label, `${path}.label`) }),
      ...(columns === undefined ? {} : { columns }),
      ...(rows === undefined ? {} : { rows }),
      ...(pane.sizing === undefined ? {} : { sizing: text(pane.sizing, `${path}.sizing`) as 'fixed' | 'flex' }),
      ...(pane.alignment === undefined ? {} : { alignment: text(pane.alignment, `${path}.alignment`) as 'start' | 'center' | 'end' }),
      ...(pane.style === undefined ? {} : { style: text(pane.style, `${path}.style`) as 'slots' | 'wood' | 'parchment' }),
      ...(pane.minWidth === undefined ? {} : { minWidth: integer(pane.minWidth, `${path}.minWidth`, 1) }),
      bind: parseBinding(pane.bind, `${path}.bind`),
      ...(pane.restriction === undefined ? {} : { restriction: parseRestriction(pane.restriction, `${path}.restriction`) }),
      ...(pane.visibleWhen === undefined ? {} : { visibleWhen: parseVisibility(pane.visibleWhen, `${path}.visibleWhen`) }),
    };
  });
  if (panes.length === 0 || new Set(panes.map(({ id: paneId }) => paneId)).size !== panes.length) {
    throw new Error('$.panes: expected at least one pane with unique ids');
  }
  const buttons = source.buttons === undefined ? undefined : array(source.buttons, '$.buttons').map((value, index) => {
    const path = `$.buttons[${index}]`;
    const button = record(value, path);
    return {
      label: text(button.label, `${path}.label`),
      interaction: reference(button.interaction, `${path}.interaction`),
      ...(button.onInvoke === undefined ? {} : { onInvoke: parseOnInvoke(button.onInvoke, `${path}.onInvoke`) }),
      ...(button.tone === undefined ? {} : { tone: text(button.tone, `${path}.tone`) as Exclude<FrameButtonDefinition['tone'], undefined> }),
      ...(button.visibleWhen === undefined ? {} : { visibleWhen: parseVisibility(button.visibleWhen, `${path}.visibleWhen`) }),
    };
  });
  if (buttons !== undefined && new Set(buttons.map(({ interaction }) => interaction)).size !== buttons.length) {
    throw new Error('$.buttons: expected unique interaction ids');
  }
  const hotbar = source.hotbar === undefined ? undefined : record(source.hotbar, '$.hotbar');
  const presentation = source.presentation === undefined ? undefined : record(source.presentation, '$.presentation');
  const surface = presentation === undefined ? undefined : text(presentation.surface, '$.presentation.surface');
  if (surface !== undefined && !FRAME_SURFACES.has(surface as FrameSurface)) throw new Error('$.presentation.surface: unsupported surface');
  const entityContainer = presentation?.entityContainer === undefined
    ? undefined
    : text(presentation.entityContainer, '$.presentation.entityContainer');
  if (entityContainer !== undefined && entityContainer !== 'chest' && entityContainer !== 'placeable' && entityContainer !== 'stash') {
    throw new Error('$.presentation.entityContainer: unsupported container');
  }
  if (surface === 'entity' && entityContainer === undefined) {
    throw new Error('$.presentation.entityContainer: entity surface requires a container');
  }
  if (surface !== undefined && surface !== 'entity' && entityContainer !== undefined) {
    throw new Error('$.presentation.entityContainer: only entity surfaces may select a container');
  }
  return Object.freeze({
    id: id as FrameDefinitionId,
    kind: 'frame',
    schemaVersion: FRAME_SCHEMA_VERSION,
    title: text(source.title, '$.title'),
    style: style as FrameStyle,
    ...(surface === undefined ? {} : { presentation: {
      surface: surface as FrameSurface,
      ...(entityContainer === undefined ? {} : { entityContainer: entityContainer as FrameEntityContainer }),
    } }),
    ...(source.resizable === undefined ? {} : { resizable: boolean(source.resizable, '$.resizable') }),
    ...(source.preferredWidth === undefined ? {} : { preferredWidth: integer(source.preferredWidth, '$.preferredWidth', 1) }),
    panes,
    ...(buttons === undefined ? {} : { buttons }),
    ...(hotbar === undefined ? {} : { hotbar: {
      ...(hotbar.label === undefined ? {} : { label: text(hotbar.label, '$.hotbar.label') }),
    } }),
    ...(source.retired === undefined ? {} : { retired: boolean(source.retired, '$.retired') }),
    ...(source.replacement === undefined ? {} : { replacement: text(source.replacement, '$.replacement') as FrameDefinitionId }),
  });
}
