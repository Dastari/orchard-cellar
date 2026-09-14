import type {
  ItemLifecycleSource,
  LifecycleSourceBundle,
} from '@orchard/lifecycle-authoring';
import { validateLifecycleSourceBundleAst } from '@orchard/lifecycle-authoring/compiler';

export const STUDIO_LIFECYCLE_DRAFT_FORMAT = 'orchard-studio-lifecycle-draft-v1' as const;
export const STUDIO_LIFECYCLE_DRAFT_STORAGE_PREFIX = 'orchard-studio:lifecycle-draft:v1:' as const;

const LIFECYCLE_SOURCE_FORMAT = 'orchard-lifecycle-source-v1' satisfies LifecycleSourceBundle['format'];
const LIFECYCLE_ENGINE_API_VERSION = 1 satisfies LifecycleSourceBundle['engineApiVersion'];
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9_.:-]{0,126}[a-z0-9])?$/u;
const MAX_HANDLER_SOURCE_BYTES = 16_384;
const MAX_HANDLERS_PER_BUNDLE = 512;

export type StudioLifecycleTrigger = NonNullable<ItemLifecycleSource['triggers']>[number];
export const STUDIO_LIFECYCLE_TRIGGER_ORDER = Object.freeze([
  'secondary', 'equipmentUse', 'worldItemUse', 'useWith', 'useAt', 'aimedUse', 'place',
] as const satisfies readonly StudioLifecycleTrigger[]);

export interface StudioItemLifecycleSource extends ItemLifecycleSource {
  readonly triggers: readonly StudioLifecycleTrigger[];
}

export interface StudioLifecycleSourceBundle extends Omit<LifecycleSourceBundle, 'handlers'> {
  readonly handlers: readonly StudioItemLifecycleSource[];
}

export type LifecycleAuthoringDiagnosticCode =
  | 'ast_invalid'
  | 'bundle_id_invalid'
  | 'duplicate_handler_id'
  | 'duplicate_item_lifecycle'
  | 'engine_api_unsupported'
  | 'event_unsupported'
  | 'format_unsupported'
  | 'handler_count_invalid'
  | 'handler_id_invalid'
  | 'import_invalid'
  | 'item_id_invalid'
  | 'prompt_invalid'
  | 'revision_invalid'
  | 'source_invalid'
  | 'trigger_invalid';

export interface LifecycleAuthoringDiagnostic {
  readonly severity: 'error';
  readonly code: LifecycleAuthoringDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export interface LifecycleAuthoringState {
  readonly bundle: StudioLifecycleSourceBundle;
  readonly baseline: StudioLifecycleSourceBundle | null;
  readonly diagnostics: readonly LifecycleAuthoringDiagnostic[];
  readonly dirty: boolean;
  readonly valid: boolean;
}

interface PersistedLifecycleDraft {
  readonly format: typeof STUDIO_LIFECYCLE_DRAFT_FORMAT;
  readonly baseline: StudioLifecycleSourceBundle | null;
  readonly bundle: StudioLifecycleSourceBundle;
}

export interface LifecycleDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type LifecycleAuthoringResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly LifecycleAuthoringDiagnostic[] };

export type LifecycleDraftRestoreResult =
  | { readonly status: 'missing'; readonly state: null }
  | { readonly status: 'restored'; readonly state: LifecycleAuthoringState }
  | { readonly status: 'invalid'; readonly state: null; readonly diagnostics: readonly LifecycleAuthoringDiagnostic[] };

export type StudioItemLifecyclePatch = Partial<Pick<
  StudioItemLifecycleSource,
  'itemId' | 'id' | 'prompt' | 'source' | 'triggers'
>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function error(
  code: LifecycleAuthoringDiagnosticCode,
  path: string,
  message: string,
): LifecycleAuthoringDiagnostic {
  return Object.freeze({ severity: 'error', code, path, message });
}

function sourceBytes(source: string): number {
  return new TextEncoder().encode(source).byteLength;
}

function isLifecycleTrigger(value: unknown): value is StudioLifecycleTrigger {
  return typeof value === 'string'
    && STUDIO_LIFECYCLE_TRIGGER_ORDER.some((candidate) => candidate === value);
}

function triggerRank(trigger: StudioLifecycleTrigger): number {
  return STUDIO_LIFECYCLE_TRIGGER_ORDER.indexOf(trigger);
}

function normalizeTriggers(triggers: readonly StudioLifecycleTrigger[]): readonly StudioLifecycleTrigger[] {
  return Object.freeze([...new Set(triggers)].sort((left, right) => triggerRank(left) - triggerRank(right)));
}

function handlerSortKey(handler: StudioItemLifecycleSource): string {
  return `${handler.itemId}\0${handler.event}\0${handler.id}`;
}

function freezeHandler(handler: StudioItemLifecycleSource): StudioItemLifecycleSource {
  return Object.freeze({
    itemId: handler.itemId,
    id: handler.id,
    event: 'onUse',
    prompt: handler.prompt,
    source: handler.source,
    triggers: normalizeTriggers(handler.triggers),
  });
}

function freezeBundle(bundle: StudioLifecycleSourceBundle): StudioLifecycleSourceBundle {
  const handlers = bundle.handlers.map(freezeHandler)
    .sort((left, right) => {
      const leftKey = handlerSortKey(left);
      const rightKey = handlerSortKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  return Object.freeze({
    format: LIFECYCLE_SOURCE_FORMAT,
    bundleId: bundle.bundleId,
    revision: bundle.revision,
    engineApiVersion: LIFECYCLE_ENGINE_API_VERSION,
    handlers: Object.freeze(handlers),
  });
}

function canonicalBundleValue(bundle: StudioLifecycleSourceBundle, includeRevision = true): unknown {
  return {
    format: bundle.format,
    bundleId: bundle.bundleId,
    ...(includeRevision ? { revision: bundle.revision } : {}),
    engineApiVersion: bundle.engineApiVersion,
    handlers: bundle.handlers.map((handler) => ({
      itemId: handler.itemId,
      id: handler.id,
      event: handler.event,
      prompt: handler.prompt,
      source: handler.source,
      triggers: [...handler.triggers],
    })),
  };
}

function canonicalBundleJson(bundle: StudioLifecycleSourceBundle, includeRevision = true): string {
  return JSON.stringify(canonicalBundleValue(bundle, includeRevision));
}

function diagnoseBundle(bundle: StudioLifecycleSourceBundle): readonly LifecycleAuthoringDiagnostic[] {
  const diagnostics: LifecycleAuthoringDiagnostic[] = [];
  if (bundle.format !== LIFECYCLE_SOURCE_FORMAT) {
    diagnostics.push(error('format_unsupported', 'format', 'Unsupported lifecycle source format.'));
  }
  if (!ID_PATTERN.test(bundle.bundleId)) {
    diagnostics.push(error('bundle_id_invalid', 'bundleId', 'Bundle ID must be a stable lowercase ID.'));
  }
  if (!Number.isSafeInteger(bundle.revision) || bundle.revision < 1) {
    diagnostics.push(error('revision_invalid', 'revision', 'Revision must be a positive safe integer.'));
  }
  if (bundle.engineApiVersion !== LIFECYCLE_ENGINE_API_VERSION) {
    diagnostics.push(error('engine_api_unsupported', 'engineApiVersion', 'Unsupported lifecycle engine API.'));
  }
  if (bundle.handlers.length < 1 || bundle.handlers.length > MAX_HANDLERS_PER_BUNDLE) {
    diagnostics.push(error(
      'handler_count_invalid',
      'handlers',
      `A lifecycle source bundle must contain 1-${MAX_HANDLERS_PER_BUNDLE} handlers.`,
    ));
  }

  const ids = new Set<string>();
  const itemIds = new Set<string>();
  for (const [index, handler] of bundle.handlers.entries()) {
    const path = `handlers[${index}]`;
    if (!ID_PATTERN.test(handler.itemId) || !handler.itemId.startsWith('item:')) {
      diagnostics.push(error('item_id_invalid', `${path}.itemId`, 'Item ID must be a full item:* content ID.'));
    }
    if (itemIds.has(handler.itemId)) {
      diagnostics.push(error(
        'duplicate_item_lifecycle',
        `${path}.itemId`,
        `${handler.itemId} already has an authored onUse callback; add triggers to that callback instead.`,
      ));
    }
    itemIds.add(handler.itemId);
    if (!ID_PATTERN.test(handler.id)) {
      diagnostics.push(error('handler_id_invalid', `${path}.id`, 'Handler ID must be a stable lowercase ID.'));
    }
    if (handler.event !== 'onUse') {
      diagnostics.push(error('event_unsupported', `${path}.event`, 'Only the onUse lifecycle is currently supported.'));
    }
    if (handler.prompt.length === 0 || handler.prompt.trim() !== handler.prompt || handler.prompt.length > 96) {
      diagnostics.push(error('prompt_invalid', `${path}.prompt`, 'Prompt must be trimmed and contain 1-96 characters.'));
    }
    if (handler.source.length === 0 || handler.source.includes('\0') || handler.source.includes('\r')
      || sourceBytes(handler.source) > MAX_HANDLER_SOURCE_BYTES) {
      diagnostics.push(error(
        'source_invalid',
        `${path}.source`,
        `Source must be non-empty LF-only TypeScript under ${MAX_HANDLER_SOURCE_BYTES} bytes.`,
      ));
    }
    if (handler.triggers.length === 0 || handler.triggers.some((trigger) => !STUDIO_LIFECYCLE_TRIGGER_ORDER.includes(trigger))) {
      diagnostics.push(error(
        'trigger_invalid',
        `${path}.triggers`,
        'Choose at least one supported trigger: secondary, equipmentUse, worldItemUse, useWith, useAt, aimedUse, or place.',
      ));
    }
    if (ids.has(handler.id)) {
      diagnostics.push(error('duplicate_handler_id', `${path}.id`, `Duplicate lifecycle handler ID: ${handler.id}.`));
    }
    ids.add(handler.id);
    if (handler.source.length > 0 && !handler.source.includes('\0') && !handler.source.includes('\r')
      && sourceBytes(handler.source) <= MAX_HANDLER_SOURCE_BYTES) {
      try {
        validateLifecycleSourceBundleAst({
          format: LIFECYCLE_SOURCE_FORMAT,
          bundleId: 'studio-diagnostics',
          revision: 1,
          engineApiVersion: LIFECYCLE_ENGINE_API_VERSION,
          handlers: [handler],
        });
      } catch (cause: unknown) {
        diagnostics.push(error(
          'ast_invalid',
          `${path}.source`,
          cause instanceof Error ? cause.message : 'Lifecycle source failed compiler validation.',
        ));
      }
    }
  }
  return Object.freeze(diagnostics);
}

function contentMatches(
  left: StudioLifecycleSourceBundle,
  right: StudioLifecycleSourceBundle,
): boolean {
  return canonicalBundleJson(left, false) === canonicalBundleJson(right, false);
}

function buildState(
  inputBundle: StudioLifecycleSourceBundle,
  baseline: StudioLifecycleSourceBundle | null,
): LifecycleAuthoringState {
  let bundle = freezeBundle(inputBundle);
  if (baseline !== null) {
    const nextRevision = contentMatches(bundle, baseline) ? baseline.revision : baseline.revision + 1;
    bundle = freezeBundle({ ...bundle, revision: nextRevision });
  }
  const diagnostics = diagnoseBundle(bundle);
  return Object.freeze({
    bundle,
    baseline,
    diagnostics,
    dirty: baseline === null || canonicalBundleJson(bundle) !== canonicalBundleJson(baseline),
    valid: diagnostics.length === 0,
  });
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const present = Object.keys(value);
  return present.length === allowed.length && present.every((key) => allowed.includes(key));
}

function decodeHandler(value: unknown): StudioItemLifecycleSource | null {
  if (!isRecord(value)) return null;
  const allowed = ['itemId', 'id', 'event', 'prompt', 'source', 'triggers'] as const;
  const legacyAllowed = ['itemId', 'id', 'event', 'prompt', 'source'] as const;
  if (!exactKeys(value, allowed) && !exactKeys(value, legacyAllowed)) return null;
  if (typeof value.itemId !== 'string' || typeof value.id !== 'string' || value.event !== 'onUse'
    || typeof value.prompt !== 'string' || typeof value.source !== 'string') return null;
  const rawTriggers = value.triggers ?? ['secondary'];
  if (!Array.isArray(rawTriggers) || rawTriggers.length > STUDIO_LIFECYCLE_TRIGGER_ORDER.length
    || !rawTriggers.every(isLifecycleTrigger)) {
    return null;
  }
  return freezeHandler({
    itemId: value.itemId,
    id: value.id,
    event: 'onUse',
    prompt: value.prompt,
    source: value.source,
    triggers: rawTriggers,
  });
}

function decodeBundle(value: unknown): StudioLifecycleSourceBundle | null {
  if (!isRecord(value)
    || !exactKeys(value, ['format', 'bundleId', 'revision', 'engineApiVersion', 'handlers'])
    || value.format !== LIFECYCLE_SOURCE_FORMAT
    || typeof value.bundleId !== 'string'
    || typeof value.revision !== 'number'
    || value.engineApiVersion !== LIFECYCLE_ENGINE_API_VERSION
    || !Array.isArray(value.handlers)
    || value.handlers.length > MAX_HANDLERS_PER_BUNDLE) return null;
  const handlers: StudioItemLifecycleSource[] = [];
  for (const entry of value.handlers) {
    const handler = decodeHandler(entry);
    if (handler === null) return null;
    handlers.push(handler);
  }
  return freezeBundle({
    format: LIFECYCLE_SOURCE_FORMAT,
    bundleId: value.bundleId,
    revision: value.revision,
    engineApiVersion: LIFECYCLE_ENGINE_API_VERSION,
    handlers,
  });
}

function invalidImport(message: string): LifecycleAuthoringResult<never> {
  return { ok: false, diagnostics: Object.freeze([error('import_invalid', '', message)]) };
}

export function createLifecycleAuthoringState(bundleId: string): LifecycleAuthoringState {
  return buildState({
    format: LIFECYCLE_SOURCE_FORMAT,
    bundleId,
    revision: 1,
    engineApiVersion: LIFECYCLE_ENGINE_API_VERSION,
    handlers: [],
  }, null);
}

export function importLifecycleSourceBundle(source: string): LifecycleAuthoringResult<LifecycleAuthoringState> {
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { return invalidImport('Lifecycle source is not valid JSON.'); }
  const bundle = decodeBundle(value);
  if (bundle === null) return invalidImport('Lifecycle source does not match the supported bundle schema.');
  const state = buildState(bundle, bundle);
  return state.valid ? { ok: true, value: state } : { ok: false, diagnostics: state.diagnostics };
}

export function addLifecycleHandler(
  state: LifecycleAuthoringState,
  handler: StudioItemLifecycleSource,
): LifecycleAuthoringState {
  return buildState({ ...state.bundle, handlers: [...state.bundle.handlers, handler] }, state.baseline);
}

export function replaceLifecycleHandlerAt(
  state: LifecycleAuthoringState,
  index: number,
  patch: StudioItemLifecyclePatch,
): LifecycleAuthoringState {
  if (!Number.isSafeInteger(index) || index < 0 || index >= state.bundle.handlers.length) return state;
  const handlers = state.bundle.handlers.map((handler, candidate) => candidate === index
    ? freezeHandler({ ...handler, ...patch, event: 'onUse' }) : handler);
  return buildState({ ...state.bundle, handlers }, state.baseline);
}

export function removeLifecycleHandlerAt(
  state: LifecycleAuthoringState,
  index: number,
): LifecycleAuthoringState {
  if (!Number.isSafeInteger(index) || index < 0 || index >= state.bundle.handlers.length) return state;
  return buildState({
    ...state.bundle,
    handlers: state.bundle.handlers.filter((_, candidate) => candidate !== index),
  }, state.baseline);
}

export function renameLifecycleBundle(
  state: LifecycleAuthoringState,
  bundleId: string,
): LifecycleAuthoringState {
  return buildState({ ...state.bundle, bundleId }, state.baseline);
}

export function exportLifecycleSourceBundle(
  state: LifecycleAuthoringState,
): LifecycleAuthoringResult<string> {
  if (!state.valid) return { ok: false, diagnostics: state.diagnostics };
  return { ok: true, value: `${JSON.stringify(canonicalBundleValue(state.bundle), null, 2)}\n` };
}

export function acceptLifecycleSourceRevision(state: LifecycleAuthoringState): LifecycleAuthoringState {
  if (!state.valid) return state;
  return buildState(state.bundle, state.bundle);
}

export function serializeLifecycleDraft(state: LifecycleAuthoringState): string {
  const record: PersistedLifecycleDraft = {
    format: STUDIO_LIFECYCLE_DRAFT_FORMAT,
    baseline: state.baseline,
    bundle: state.bundle,
  };
  return `${JSON.stringify({
    format: record.format,
    baseline: record.baseline === null ? null : canonicalBundleValue(record.baseline),
    bundle: canonicalBundleValue(record.bundle),
  }, null, 2)}\n`;
}

export function deserializeLifecycleDraft(source: string): LifecycleAuthoringResult<LifecycleAuthoringState> {
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { return invalidImport('Lifecycle draft is not valid JSON.'); }
  if (!isRecord(value) || !exactKeys(value, ['format', 'baseline', 'bundle'])
    || value.format !== STUDIO_LIFECYCLE_DRAFT_FORMAT) {
    return invalidImport('Lifecycle draft does not match the supported draft schema.');
  }
  const bundle = decodeBundle(value.bundle);
  const baseline = value.baseline === null ? null : decodeBundle(value.baseline);
  if (bundle === null || (value.baseline !== null && baseline === null)) {
    return invalidImport('Lifecycle draft contains malformed bundle data.');
  }
  if (baseline !== null && diagnoseBundle(baseline).length > 0) {
    return invalidImport('Lifecycle draft baseline is invalid.');
  }
  return { ok: true, value: buildState(bundle, baseline) };
}

export function lifecycleDraftStorageKey(bundleId: string): string {
  return `${STUDIO_LIFECYCLE_DRAFT_STORAGE_PREFIX}${encodeURIComponent(bundleId)}`;
}

export function persistLifecycleDraft(
  storage: LifecycleDraftStorage | null,
  state: LifecycleAuthoringState,
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(lifecycleDraftStorageKey(state.bundle.bundleId), serializeLifecycleDraft(state));
    return true;
  } catch { return false; }
}

export function restoreLifecycleDraft(
  storage: LifecycleDraftStorage | null,
  bundleId: string,
): LifecycleDraftRestoreResult {
  if (storage === null) return { status: 'missing', state: null };
  const key = lifecycleDraftStorageKey(bundleId);
  let source: string | null;
  try { source = storage.getItem(key); }
  catch { return { status: 'missing', state: null }; }
  if (source === null) return { status: 'missing', state: null };
  const restored = deserializeLifecycleDraft(source);
  if (restored.ok) return { status: 'restored', state: restored.value };
  try { storage.removeItem?.(key); } catch { /* Non-persistent sandbox. */ }
  return { status: 'invalid', state: null, diagnostics: restored.diagnostics };
}
