import { createOverworldContentArtRequests } from '@orchard/engine';
import type { ContentRegistry } from '@orchard/sim';
import {
  createGeneratedContentAssetRequests,
  createSkillNodeArtRequests,
  type GeneratedContentAssetLoader,
  type LoadedAsset,
} from '@orchard/ui';
import type { LiveContentState } from './live-content.js';

type ArtRegistry = Pick<ContentRegistry, 'items' | 'crops' | 'skillTrees' | 'contentHash'>;

export interface ClientContentArtTarget {
  readonly itemIcons: Readonly<Record<string, LoadedAsset>>;
  readonly crops: Readonly<Record<string, LoadedAsset>>;
  readonly uiSkin: {
    readonly skillIcons: Readonly<Record<string, LoadedAsset>>;
  };
}

export type ContentArtSyncStatus = 'ignored' | 'unchanged' | 'applied' | 'partial' | 'stale';

export interface ContentArtSyncResult {
  readonly key: string | null;
  readonly status: ContentArtSyncStatus;
  readonly requested: number;
  readonly applied: number;
  readonly failed: number;
}

interface AssetPlan {
  readonly family: 'item' | 'crop' | 'skill';
  readonly runtimeKey: string;
  readonly assetKey: string;
  readonly request: () => Promise<LoadedAsset | null>;
}

interface ResolvedAssetPlan extends AssetPlan {
  readonly asset: LoadedAsset | null;
}

/** Stable snapshot identity for active presentation data. Draft projections
 * include the parsed registry hash because they intentionally retain the live
 * head revision while changing authored definitions locally. */
export function contentArtRevisionKey(content: LiveContentState): string | null {
  if (content.status !== 'ready') return null;
  return content.head === null
    ? `bootstrap:${content.registry.contentHash}`
    : `${content.head.revision}:${content.head.contentHash}:${content.registry.contentHash}`;
}

function runtimeKind(definitionId: string, prefix: string): string {
  return definitionId.slice(prefix.length);
}

function writeAsset(
  target: Readonly<Record<string, LoadedAsset>>,
  key: string,
  asset: LoadedAsset,
): boolean {
  try {
    return Reflect.set(target, key, asset);
  } catch {
    return false;
  }
}

/** Revision-aware bridge between verified live content and the synchronous
 * maps consumed by the canvas renderer. It never deletes existing artwork and
 * commits only assets which loaded successfully for the latest snapshot. */
export class ClientContentArtSynchronizer {
  readonly #target: ClientContentArtTarget;
  readonly #onChanged: () => void;
  readonly #assetRequests;
  readonly #knownAssets = new Map<string, LoadedAsset>();
  readonly #itemAssetKeys = new Map<string, string>();
  readonly #cropAssetKeys = new Map<string, string>();
  readonly #skillAssetKeys = new Map<string, string>();
  readonly #inFlight = new Map<string, Promise<ContentArtSyncResult>>();
  #latestKey: string | null = null;
  #completedKey: string | null = null;
  #completedResult: ContentArtSyncResult | null = null;
  #maximumRevision: bigint | null = null;

  constructor(
    target: ClientContentArtTarget,
    initialRegistry: ArtRegistry,
    onChanged: () => void = () => undefined,
    loadAsset?: GeneratedContentAssetLoader,
  ) {
    this.#target = target;
    this.#onChanged = onChanged;
    this.#assetRequests = createGeneratedContentAssetRequests(loadAsset);
    this.#seed(initialRegistry);
  }

  synchronize(content: LiveContentState): Promise<ContentArtSyncResult> {
    const key = contentArtRevisionKey(content);
    if (key === null) return Promise.resolve({ key, status: 'ignored', requested: 0, applied: 0, failed: 0 });
    const revision = content.head?.revision ?? null;
    if (this.#maximumRevision !== null && (revision === null || revision < this.#maximumRevision)) {
      return Promise.resolve({ key, status: 'stale', requested: 0, applied: 0, failed: 0 });
    }
    if (revision !== null && (this.#maximumRevision === null || revision > this.#maximumRevision)) {
      this.#maximumRevision = revision;
    }
    const pending = this.#inFlight.get(key);
    if (pending !== undefined) return pending;
    if (this.#completedKey === key && this.#completedResult !== null) {
      return Promise.resolve({ ...this.#completedResult,
        status: this.#completedResult.failed > 0 ? 'partial' : 'unchanged', requested: 0, applied: 0 });
    }
    this.#latestKey = key;
    const request = this.#synchronize(key, content.registry);
    this.#inFlight.set(key, request);
    void request.then(
      () => this.#inFlight.delete(key),
      () => this.#inFlight.delete(key),
    );
    return request;
  }

  async #loadAsset(assetKey: string): Promise<LoadedAsset> {
    const known = this.#knownAssets.get(assetKey);
    if (known !== undefined) return known;
    const asset = await this.#assetRequests.request(assetKey);
    this.#knownAssets.set(assetKey, asset);
    return asset;
  }

  #plans(registry: ArtRegistry): readonly AssetPlan[] {
    const loadAsset = async (assetKey: string) => await this.#loadAsset(assetKey);
    const overworld = createOverworldContentArtRequests(registry, loadAsset);
    const skills = createSkillNodeArtRequests(registry, loadAsset);
    const plans: AssetPlan[] = [];
    for (const definition of registry.items.values()) {
      if (definition.retired === true) continue;
      const runtimeKey = runtimeKind(definition.id, 'item:');
      if (this.#itemAssetKeys.get(runtimeKey) === definition.icon.asset) continue;
      plans.push({ family: 'item', runtimeKey, assetKey: definition.icon.asset,
        request: async () => await overworld.item(runtimeKey) });
    }
    for (const definition of registry.crops.values()) {
      if (definition.retired === true) continue;
      const runtimeKey = runtimeKind(definition.id, 'crop:');
      if (this.#cropAssetKeys.get(runtimeKey) === definition.asset) continue;
      plans.push({ family: 'crop', runtimeKey, assetKey: definition.asset,
        request: async () => await overworld.crop(runtimeKey) });
    }
    for (const tree of registry.skillTrees.values()) {
      if (tree.retired === true) continue;
      for (const node of tree.nodes) {
        if (this.#skillAssetKeys.get(node.id) === node.iconAsset) continue;
        plans.push({ family: 'skill', runtimeKey: node.id, assetKey: node.iconAsset,
          request: async () => await skills.request(node.id) });
      }
    }
    return plans;
  }

  async #synchronize(key: string, registry: ArtRegistry): Promise<ContentArtSyncResult> {
    const plans = this.#plans(registry);
    const resolved = await Promise.all(plans.map(async (plan): Promise<ResolvedAssetPlan> => {
      try {
        return { ...plan, asset: await plan.request() };
      } catch {
        return { ...plan, asset: null };
      }
    }));
    if (this.#latestKey !== key) {
      return { key, status: 'stale', requested: plans.length, applied: 0,
        failed: resolved.filter(({ asset }) => asset === null).length };
    }
    let applied = 0;
    let failed = 0;
    for (const plan of resolved) {
      if (plan.asset === null) {
        failed += 1;
        continue;
      }
      const target = plan.family === 'item' ? this.#target.itemIcons
        : plan.family === 'crop' ? this.#target.crops : this.#target.uiSkin.skillIcons;
      if (!writeAsset(target, plan.runtimeKey, plan.asset)) {
        failed += 1;
        continue;
      }
      const keys = plan.family === 'item' ? this.#itemAssetKeys
        : plan.family === 'crop' ? this.#cropAssetKeys : this.#skillAssetKeys;
      keys.set(plan.runtimeKey, plan.assetKey);
      applied += 1;
    }
    if (applied > 0) this.#onChanged();
    const result: ContentArtSyncResult = {
      key,
      status: failed > 0 ? 'partial' : applied > 0 ? 'applied' : 'unchanged',
      requested: plans.length,
      applied,
      failed,
    };
    this.#completedKey = key;
    this.#completedResult = result;
    return result;
  }

  #seed(registry: ArtRegistry): void {
    for (const definition of registry.items.values()) {
      if (definition.retired === true) continue;
      const runtimeKey = runtimeKind(definition.id, 'item:');
      const asset = this.#target.itemIcons[runtimeKey];
      if (asset === undefined) continue;
      this.#itemAssetKeys.set(runtimeKey, definition.icon.asset);
      this.#knownAssets.set(definition.icon.asset, asset);
    }
    for (const definition of registry.crops.values()) {
      if (definition.retired === true) continue;
      const runtimeKey = runtimeKind(definition.id, 'crop:');
      const asset = this.#target.crops[runtimeKey];
      if (asset === undefined) continue;
      this.#cropAssetKeys.set(runtimeKey, definition.asset);
      this.#knownAssets.set(definition.asset, asset);
    }
    for (const tree of registry.skillTrees.values()) {
      if (tree.retired === true) continue;
      for (const node of tree.nodes) {
        const asset = this.#target.uiSkin.skillIcons[node.id];
        if (asset === undefined) continue;
        this.#skillAssetKeys.set(node.id, node.iconAsset);
        this.#knownAssets.set(node.iconAsset, asset);
      }
    }
  }
}

export function createClientContentArtSynchronizer(
  target: ClientContentArtTarget,
  initialRegistry: ArtRegistry,
  onChanged?: () => void,
  loadAsset?: GeneratedContentAssetLoader,
): ClientContentArtSynchronizer {
  return new ClientContentArtSynchronizer(target, initialRegistry, onChanged, loadAsset);
}
