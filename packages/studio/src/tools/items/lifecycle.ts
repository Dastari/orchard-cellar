import type { ItemDefinitionId } from '@orchard/sim';
import {
  addLifecycleHandler,
  createLifecycleAuthoringState,
  exportLifecycleSourceBundle,
  importLifecycleSourceBundle,
  persistLifecycleDraft,
  removeLifecycleHandlerAt,
  replaceLifecycleHandlerAt,
  restoreLifecycleDraft,
  type LifecycleAuthoringResult,
  type LifecycleAuthoringState,
  type LifecycleDraftStorage,
  type StudioItemLifecyclePatch,
  type StudioItemLifecycleSource,
  type StudioLifecycleSourceBundle,
  type StudioLifecycleTrigger,
} from '../../lifecycle/model.js';

export const ITEMS_LIFECYCLE_BUNDLE_ID = 'orchard-items' as const;
export const ITEMS_LIFECYCLE_MEDIA_TYPE = 'application/json' as const;

export interface ItemsLifecycleDraftOptions {
  readonly baseline?: StudioLifecycleSourceBundle;
  readonly storage?: LifecycleDraftStorage | null;
}

export interface ItemsLifecycleDownload {
  readonly filename: string;
  readonly json: string;
  readonly blob: Blob;
}

const DEFAULT_SOURCE = 'context.pass();';

function itemHandlerStem(itemId: ItemDefinitionId): string {
  return `${itemId}.on_use`;
}

function initialState(options: ItemsLifecycleDraftOptions): LifecycleAuthoringState {
  const baseline = options.baseline;
  if (baseline !== undefined) {
    const imported = importLifecycleSourceBundle(JSON.stringify(baseline));
    if (!imported.ok) throw new Error(`items_lifecycle_baseline_invalid:${imported.diagnostics[0]?.message ?? 'unknown'}`);
    const restored = restoreLifecycleDraft(options.storage ?? null, imported.value.bundle.bundleId);
    return restored.status === 'restored' ? restored.state : imported.value;
  }
  const restored = restoreLifecycleDraft(options.storage ?? null, ITEMS_LIFECYCLE_BUNDLE_ID);
  return restored.status === 'restored'
    ? restored.state
    : createLifecycleAuthoringState(ITEMS_LIFECYCLE_BUNDLE_ID);
}

export class ItemsLifecycleDraft {
  readonly #storage: LifecycleDraftStorage | null;
  #state: LifecycleAuthoringState;

  constructor(options: ItemsLifecycleDraftOptions = {}) {
    this.#storage = options.storage ?? null;
    this.#state = initialState(options);
  }

  snapshot(): LifecycleAuthoringState { return this.#state; }

  handlers(itemId: ItemDefinitionId): readonly StudioItemLifecycleSource[] {
    return this.#state.bundle.handlers.filter((handler) => handler.itemId === itemId);
  }

  create(itemId: ItemDefinitionId): StudioItemLifecycleSource {
    if (this.#state.bundle.handlers.some((handler) => handler.itemId === itemId)) {
      throw new Error(`duplicate_item_lifecycle:${itemId}`);
    }
    const used = new Set(this.#state.bundle.handlers.map(({ id }) => id));
    const stem = itemHandlerStem(itemId);
    let id = stem;
    for (let suffix = 2; used.has(id); suffix += 1) id = `${stem}_${suffix}`;
    const handler: StudioItemLifecycleSource = {
      itemId,
      id,
      event: 'onUse',
      prompt: 'USE ITEM',
      source: DEFAULT_SOURCE,
      triggers: ['secondary'],
    };
    this.#state = addLifecycleHandler(this.#state, handler);
    this.persist();
    return this.#state.bundle.handlers.find((candidate) => candidate.id === id)!;
  }

  update(handlerId: string, patch: StudioItemLifecyclePatch): LifecycleAuthoringState {
    const index = this.#state.bundle.handlers.findIndex(({ id }) => id === handlerId);
    if (index < 0) return this.#state;
    this.#state = replaceLifecycleHandlerAt(this.#state, index, patch);
    this.persist();
    return this.#state;
  }

  remove(handlerId: string): LifecycleAuthoringState {
    const index = this.#state.bundle.handlers.findIndex(({ id }) => id === handlerId);
    if (index < 0) return this.#state;
    this.#state = removeLifecycleHandlerAt(this.#state, index);
    this.persist();
    return this.#state;
  }

  toggleTrigger(handlerId: string, trigger: StudioLifecycleTrigger): LifecycleAuthoringState {
    const handler = this.#state.bundle.handlers.find(({ id }) => id === handlerId);
    if (handler === undefined) return this.#state;
    const triggers = handler.triggers.includes(trigger)
      ? handler.triggers.filter((candidate) => candidate !== trigger)
      : [...handler.triggers, trigger];
    return this.update(handlerId, { triggers });
  }

  import(source: string): LifecycleAuthoringResult<LifecycleAuthoringState> {
    const imported = importLifecycleSourceBundle(source);
    if (!imported.ok) return imported;
    this.#state = imported.value;
    this.persist();
    return { ok: true, value: this.#state };
  }

  export(): LifecycleAuthoringResult<string> {
    return exportLifecycleSourceBundle(this.#state);
  }

  download(): LifecycleAuthoringResult<ItemsLifecycleDownload> {
    const exported = this.export();
    if (!exported.ok) return exported;
    const filename = `${this.#state.bundle.bundleId}-r${this.#state.bundle.revision}.lifecycle.json`;
    return {
      ok: true,
      value: {
        filename,
        json: exported.value,
        blob: new Blob([exported.value], { type: ITEMS_LIFECYCLE_MEDIA_TYPE }),
      },
    };
  }

  private persist(): void {
    persistLifecycleDraft(this.#storage, this.#state);
  }
}
