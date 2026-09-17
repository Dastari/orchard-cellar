import type { InteractionDefinition, ItemContentDefinition, ItemOnUseEventType, MoveItemRequest } from '@orchard/sim';
import lifecycleMetadata from '@orchard/lifecycle-authoring/metadata' with { type: 'json' };

interface ItemLifecycleClientMetadata {
  readonly itemId: string;
  readonly event: 'onUse';
  readonly id: string;
  readonly prompt: string;
  readonly triggers?: readonly ItemOnUseEventType[];
}

export interface SelectedItemLifecycleAction extends Omit<InteractionDefinition, 'verb'> {
  /** These are code-lifecycle input lanes, not persisted data-graph verbs. */
  readonly verb: InteractionDefinition['verb'] | 'equipment_use' | 'world_item_use' | 'use_at' | 'aimed_use';
}

export type SelectedFarmToolMode = 'cultivate' | 'water';

export interface SelectedFarmToolAction {
  readonly lifecycle: SelectedItemLifecycleAction;
  readonly mode: SelectedFarmToolMode;
  readonly useActionId: 'use';
  readonly restoreActionId: 'restore' | null;
}

export interface SelectedFishingToolAction {
  readonly lifecycle: SelectedItemLifecycleAction;
  readonly castActionId: 'cast';
  readonly reelActionId: 'reel';
}

export interface SelectedCellarToolAction {
  readonly lifecycle: SelectedItemLifecycleAction;
  readonly actionId: 'dig_cellar';
}

const VERB_BY_TRIGGER = {
  secondary: 'secondary',
  equipmentUse: 'equipment_use',
  worldItemUse: 'world_item_use',
  useWith: 'use_with',
  useAt: 'use_at',
  aimedUse: 'aimed_use',
  place: 'place',
} as const satisfies Readonly<Record<ItemOnUseEventType, SelectedItemLifecycleAction['verb']>>;

function codeActionKey(itemId: string, trigger: ItemOnUseEventType): string {
  return `${itemId}\0${trigger}`;
}

const CODE_ACTION_BY_ITEM_EVENT = new Map(
  (lifecycleMetadata.handlers as readonly ItemLifecycleClientMetadata[])
    .filter((handler) => handler.event === 'onUse')
    .flatMap((handler) => (handler.triggers ?? ['secondary']).map((trigger) => [
      codeActionKey(handler.itemId, trigger),
      Object.freeze({
        id: handler.id,
        verb: VERB_BY_TRIGGER[trigger],
        prompt: handler.prompt,
        conditions: Object.freeze([]),
        effects: Object.freeze([]),
      }) satisfies SelectedItemLifecycleAction,
    ] as const)),
);

/** Resolves a code or data lifecycle action for one concrete input event. */
export function selectedItemLifecycleAction(
  definition: ItemContentDefinition | null | undefined,
  trigger: ItemOnUseEventType,
): SelectedItemLifecycleAction | null {
  if (definition === null || definition === undefined) return null;
  const codeAction = CODE_ACTION_BY_ITEM_EVENT.get(codeActionKey(definition.id, trigger));
  if (codeAction !== undefined) return codeAction;
  // Specialized invocation triggers exist only for compiled callbacks; persisted data graphs deliberately
  // retain their existing verb vocabulary and cannot impersonate code authority.
  if (trigger === 'equipmentUse' || trigger === 'worldItemUse'
    || trigger === 'useAt' || trigger === 'aimedUse') return null;
  const verb = VERB_BY_TRIGGER[trigger];
  let selected: SelectedItemLifecycleAction | null = null;
  for (const action of definition.onUse) {
    if (action.verb !== verb) continue;
    if (selected === null
      || (action.priority ?? 0) > (selected.priority ?? 0)
      || ((action.priority ?? 0) === (selected.priority ?? 0) && action.id < selected.id)) {
      selected = action;
    }
  }
  return selected;
}

/** Context-specific world-tool capability used for campfire/chest dismantling.
 * Both authored ownership and the live content specialization must agree. */
export function selectedWoodcuttingUseWithAction(
  definition: ItemContentDefinition | null | undefined,
): SelectedItemLifecycleAction | null {
  if (definition?.tool?.specialization !== 'woodcutting') return null;
  return selectedItemLifecycleAction(definition, 'useWith');
}

/** Resolves an authored farm-tile action without coupling capability to the
 * inventory kind. Explicit content tags distinguish farming tool roles while
 * the lifecycle trigger remains the authority for whether the action exists. */
export function selectedFarmToolAction(
  definition: ItemContentDefinition | null | undefined,
  lifecycle = selectedItemLifecycleAction(definition, 'place'),
): SelectedFarmToolAction | null {
  if (lifecycle === null || definition?.tool?.specialization !== 'farming') return null;
  const cultivates = definition.tags.includes('tool.farming.cultivate');
  const waters = definition.tags.includes('tool.farming.water');
  if (cultivates === waters) return null;
  return cultivates
    ? { lifecycle, mode: 'cultivate', useActionId: 'use', restoreActionId: 'restore' }
    : { lifecycle, mode: 'water', useActionId: 'use', restoreActionId: null };
}

/** Tile-targeted fishing is owned jointly by the authored useAt callback and
 * the live fishing specialization, never by a conventional item kind. */
export function selectedFishingToolAction(
  definition: ItemContentDefinition | null | undefined,
  lifecycle = selectedItemLifecycleAction(definition, 'useAt'),
): SelectedFishingToolAction | null {
  return lifecycle !== null && definition?.tool?.specialization === 'fishing'
    ? { lifecycle, castActionId: 'cast', reelActionId: 'reel' }
    : null;
}

/** Cellar excavation is a precise mining useAt action. */
export function selectedCellarToolAction(
  definition: ItemContentDefinition | null | undefined,
  lifecycle = selectedItemLifecycleAction(definition, 'useAt'),
): SelectedCellarToolAction | null {
  return lifecycle !== null && definition?.tool?.specialization === 'mining'
    ? { lifecycle, actionId: 'dig_cellar' }
    : null;
}

/** What the swing key does for a tool that has an authored swing. A swing is a
 * sector of entity contacts: it cannot excavate terrain, so a cellar wall in
 * reach keeps the explicit strike it had before swings existed. A targeted
 * resource stays with the swing, which contacts every resource in the arc. */
export function swingKeyIntent(actor: {
  readonly hasAuthoredSwing: boolean;
  readonly resourceTargeted: boolean;
  readonly cellarWallInReach: boolean;
  readonly cellarToolReady: boolean;
}): 'swing' | 'dig_cellar' | 'contextual' {
  if (!actor.hasAuthoredSwing) return 'contextual';
  return !actor.resourceTargeted && actor.cellarWallInReach && actor.cellarToolReady
    ? 'dig_cellar'
    : 'swing';
}

/** A contextual world tool owns both whiff/direct use and target use. The
 * client uses this to avoid dispatching the direct callback ahead of a valid
 * resource/campfire/chest target. */
export function selectedContextualWorldToolAction(
  definition: ItemContentDefinition | null | undefined,
  secondary = selectedItemLifecycleAction(definition, 'secondary'),
  useWith = selectedItemLifecycleAction(definition, 'useWith'),
): SelectedItemLifecycleAction | null {
  const specialization = definition?.tool?.specialization;
  return secondary !== null && useWith !== null
    && (specialization === 'woodcutting' || specialization === 'mining')
    ? useWith
    : null;
}

/**
 * Resolves the same deterministic first handler that the behaviour registry
 * will consider for an item's direct-use lifecycle. Item definitions, rather
 * than client item-kind switches, are the capability source of truth.
 */
export function selectedItemUseAction(
  definition: ItemContentDefinition | null | undefined,
): SelectedItemLifecycleAction | null {
  return selectedItemLifecycleAction(definition, 'secondary');
}

function actionLabel(action: SelectedItemLifecycleAction): string | null {
  if (typeof action.prompt === 'string') return action.prompt.trim() || null;
  return action.prompt?.default?.trim() || null;
}

/** Formats the winning authored callback for a concrete input lane. */
export function selectedItemLifecyclePrompt(
  definition: ItemContentDefinition | null | undefined,
  trigger: ItemOnUseEventType,
  key = 'F',
): string | null {
  if (definition === null || definition === undefined) return null;
  const action = selectedItemLifecycleAction(definition, trigger);
  if (action === null) return null;
  const repairLabel = trigger === 'useWith' && definition.durability !== undefined
    ? `REPAIR ${definition.displayName} (${definition.durability.repairCost} COPPER)`
    : null;
  const label = repairLabel ?? actionLabel(action) ?? `USE ${definition.displayName}`;
  return `[${key.toUpperCase()}] ${label.toUpperCase()}`;
}

/** A key is presentation only; changing it never changes item capability. */
export function selectedItemUsePrompt(
  definition: ItemContentDefinition | null | undefined,
  key = 'F',
): string | null {
  return selectedItemLifecyclePrompt(definition, 'secondary', key);
}

/** Hotbar use equips a switchable light before invoking its equipment lifecycle. */
export function selectedLightEquipRequest(definition: ItemContentDefinition | null | undefined, slot: number): MoveItemRequest | null {
  if (definition?.light === undefined || definition.equip?.slot !== 'off_hand'
    || selectedItemLifecycleAction(definition, 'equipmentUse') === null || slot < 0 || slot >= 10) return null;
  return { fromContainer: 'hotbar', fromIndex: slot, toContainer: 'equipment', toIndex: 5, quantity: 1 };
}
