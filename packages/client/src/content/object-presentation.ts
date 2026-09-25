import type { ResolvedObjectAppearance, ObjectContentDefinition, ObjectStateDefinition, ResolvedObjectLight, StateValue } from '@orchard/sim';
import { resolveObjectLight } from '@orchard/sim/behaviour/data-graph';
import { resolveObjectDefinitionAppearance } from '@orchard/sim/content/object-archetype';
import { runtimePlaceableBlocksMovement, placeableObjectDefinition } from '@orchard/sim/crafting';
import { hearthFurnitureShapeForPlaceable, hearthFurniturePersistentId, HEARTH_FURNITURE_SUPPORT_STATE_KEY, HEARTH_FURNITURE_REVISION_STATE_KEY } from '@orchard/sim/hearth-furniture-state';
import { loadGeneratedAsset, type LoadedAsset } from '@orchard/ui';
import type { LiveContentState } from './live-content.js';

export interface ObjectPresentationRow {
  readonly id: bigint | string;
  readonly kind: string;
  readonly open: boolean;
  readonly lit: boolean;
  /** These optional fields keep the client compatible with bindings generated
   * before the additive world_placeable migration is published. */
  readonly definitionId?: string;
  readonly stateJson?: string;
}

export interface AuthoredObjectSprite {
  readonly assetName: string;
  readonly asset: LoadedAsset | null;
  readonly animation: string;
  readonly scale: number;
}

export interface ObjectPresentation {
  readonly definitionId: string;
  readonly authored: boolean;
  readonly stateJsonValid: boolean;
  readonly state: Readonly<Record<string, StateValue>>;
  readonly sprite: AuthoredObjectSprite | null;
  readonly appearance?: ResolvedObjectAppearance;
  readonly lightingAuthored?: boolean;
  readonly light: ResolvedObjectLight | null;
  readonly collision: {
    readonly blocksMovement: boolean;
    readonly occludesLight: boolean;
  } | null;
}

type AssetLoader = (name: string, season?: string) => Promise<LoadedAsset>;

/** Visual fallback for authored flames without a content light component.
 * Follows the displayed state; an extinguished frame has no emissive spans. */
export function emissiveSpriteLight(asset: LoadedAsset | null, animation: string, scale = 1): ResolvedObjectLight | null {
  const spans = asset?.emissiveFrames?.[animation]?.find((frame) => frame.length > 0);
  if (asset === null || spans === undefined) return null;
  let weightedY = 0, pixels = 0;
  for (let i = 0; i < spans.length; i += 3) {
    weightedY += (spans[i]! + 0.5) * spans[i + 2]!; pixels += spans[i + 2]!;
  }
  return { enabled: true, color: [255, 142, 62], radiusTiles: 4,
    profile: 'flicker', offsetY: (weightedY / pixels - asset.anchor[1]) * scale };
}

function validStateValue(definition: ObjectStateDefinition, value: unknown): value is StateValue {
  if (definition.type === 'bool') return typeof value === 'boolean';
  if (definition.type === 'enum') return typeof value === 'string' && definition.values.includes(value);
  return typeof value === 'number' && Number.isSafeInteger(value)
    && (definition.min === undefined || value >= definition.min)
    && (definition.max === undefined || value <= definition.max);
}

function resolvedState(
  registry:LiveContentState['registry'],
  definition: ObjectContentDefinition,
  row: ObjectPresentationRow,
): { readonly valid: boolean; readonly state: Readonly<Record<string, StateValue>> } {
  const declarations = definition.components.states ?? {};
  const state: Record<string, StateValue> = Object.fromEntries(
    Object.entries(declarations).map(([name, declaration]) => [name, declaration.default]),
  );
  let decoded: unknown;
  try {
    decoded = JSON.parse(row.stateJson?.length ? row.stateJson : '{}') as unknown;
  } catch {
    return { valid: false, state: Object.freeze({ open: row.open, lit: row.lit }) };
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    return { valid: false, state: Object.freeze({ open: row.open, lit: row.lit }) };
  }
  for (const [name, value] of Object.entries(decoded)) {
    if ((name === HEARTH_FURNITURE_SUPPORT_STATE_KEY || name === HEARTH_FURNITURE_REVISION_STATE_KEY)
      && hearthFurnitureShapeForPlaceable(registry, row) !== null
      && hearthFurniturePersistentId(value)) continue;
    const declaration = declarations[name];
    if (declaration === undefined || !validStateValue(declaration, value)) {
      return { valid: false, state: Object.freeze({ open: row.open, lit: row.lit }) };
    }
    state[name] = value;
  }
  // Rows created before definitionId existed keep their typed compatibility
  // values even after an authored definition for their legacy kind is added.
  if ((row.definitionId?.trim() ?? '') === '') {
    if (declarations.open?.type === 'bool') state.open = row.open;
    if (declarations.lit?.type === 'bool') state.lit = row.lit;
  }
  return { valid: true, state: Object.freeze({ open: row.open, lit: row.lit, ...state }) };
}

function contentKey(content: LiveContentState): string {
  const head = content.head;
  return head === null
    ? `${content.source}:${content.registry.contentHash}`
    : `${head.packId}:${head.revision}:${head.contentHash}`;
}

/** Revision-keyed presentation cache. It never replaces the verified content
 * registry and keeps rendering the legacy art while a newly-authored asset is
 * loading or unavailable. */
export class LiveObjectPresentationCache {
  readonly #assets = new Map<string, LoadedAsset | null>();
  readonly #pendingAssets = new Set<string>();
  readonly #loadAsset: AssetLoader;
  readonly #onAssetReady: () => void;
  #revisionKey = '';
  #presentations = new Map<string, ObjectPresentation>();

  constructor(onAssetReady: () => void = () => undefined, loadAsset: AssetLoader = loadGeneratedAsset) {
    this.#onAssetReady = onAssetReady;
    this.#loadAsset = loadAsset;
  }

  resolve(content: LiveContentState, row: ObjectPresentationRow): ObjectPresentation {
    const nextRevisionKey = contentKey(content);
    if (nextRevisionKey !== this.#revisionKey) {
      this.#revisionKey = nextRevisionKey;
      this.#presentations = new Map();
    }
    const key = `${row.id}:${row.kind}:${row.open}:${row.lit}:${row.definitionId ?? ''}:${row.stateJson ?? ''}`;
    const cached = this.#presentations.get(key);
    if (cached !== undefined) return cached;
    const storedId = row.definitionId?.trim() ?? '';
    const definition = storedId === '' ? placeableObjectDefinition(content.registry, row)
      : content.registry.objects.get(storedId);
    if (definition === undefined || definition === null || definition.retired === true) {
      const legacy = Object.freeze({
        definitionId: `object:${row.kind}`, authored: false, stateJsonValid: true,
        state: Object.freeze({ open: row.open, lit: row.lit }), sprite: null, light: null,
        collision: null,
      });
      this.#presentations.set(key, legacy);
      return legacy;
    }
    const resolved = resolvedState(content.registry, definition, row);
    if (!resolved.valid) {
      const fallback = Object.freeze({
        definitionId: definition.id, authored: false, stateJsonValid: false,
        state: resolved.state, sprite: null, light: null,
        collision: definition.components.collision === undefined ? null : Object.freeze({
          blocksMovement: runtimePlaceableBlocksMovement(content.registry, row),
          occludesLight: definition.components.collision.occludesLight ?? false,
        }),
      });
      this.#presentations.set(key, fallback);
      return fallback;
    }
    const appearance = resolveObjectDefinitionAppearance(definition, resolved.state);
    const spriteDefinition = appearance.sprite;
    if (spriteDefinition !== null) this.#ensureAsset(spriteDefinition.asset);
    const presentation = Object.freeze({
      definitionId: definition.id,
      authored: true,
      stateJsonValid: true,
      state: resolved.state,
      appearance,
      lightingAuthored: definition.components.lighting !== undefined || definition.components.overrides?.some(o => o.lighting !== undefined) === true,
      sprite: spriteDefinition === null ? null : Object.freeze({
        assetName: spriteDefinition.asset,
        asset: this.#assets.get(spriteDefinition.asset) ?? null,
        animation: spriteDefinition.animation,
        scale: spriteDefinition.scale,
      }),
      light: appearance.light === null
        ? definition.components.light !== undefined
          ? { ...resolveObjectLight(definition.components.light, resolved.state), enabled: false }
          : definition.components.overrides?.some(o => o.light !== undefined) ? null
          : spriteDefinition === null ? null : emissiveSpriteLight(
            this.#assets.get(spriteDefinition.asset) ?? null, spriteDefinition.animation, spriteDefinition.scale,
          )
        : resolveObjectLight(appearance.light, resolved.state),
      collision: appearance.collision === null ? null : Object.freeze({
        blocksMovement: appearance.collision.blocksMovement,
        occludesLight: appearance.lighting.occludesLight,
      }),
    });
    this.#presentations.set(key, presentation);
    return presentation;
  }

  #ensureAsset(name: string): void {
    if (this.#assets.has(name) || this.#pendingAssets.has(name)) return;
    this.#pendingAssets.add(name);
    void this.#loadAsset(name, 'summer').then((asset) => {
      this.#assets.set(name, asset);
    }).catch(() => {
      this.#assets.set(name, null);
    }).finally(() => {
      this.#pendingAssets.delete(name);
      this.#presentations = new Map();
      this.#onAssetReady();
    });
  }
}
