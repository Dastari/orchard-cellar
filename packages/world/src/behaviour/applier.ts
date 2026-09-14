import {
  EFFECT_OPCODES,
  MAX_EFFECTS_PER_HANDLER_RESULT,
  effectKind,
  type BehaviourEffectKind,
  type Effect,
} from '@orchard/sim';

export const MAX_SPAWN_EFFECTS_PER_EVENT = 16 as const;
export const MAX_TIMER_HORIZON_TICKS = 1_209_600 as const;

export type EffectPayload<K extends BehaviourEffectKind> =
  Extract<Effect, Readonly<Record<K, unknown>>>[K];

export type EffectFor<K extends BehaviourEffectKind> =
  Extract<Effect, Readonly<Record<K, unknown>>>;

export type BehaviourEffectAdapters = {
  readonly [K in BehaviourEffectKind]: (
    payload: EffectPayload<K>,
    effect: EffectFor<K>,
    index: number,
  ) => void;
};

/**
 * The world adapter owns row-specific mechanics. Validation is deliberately a
 * separate complete pass so malformed or unauthorized batches cannot perform
 * a prefix of writes before being rejected.
 */
export interface BehaviourEffectWriter {
  readonly validate: (
    kind: BehaviourEffectKind,
    effect: Effect,
    index: number,
  ) => void;
  readonly apply: <K extends BehaviourEffectKind>(
    kind: K,
    payload: EffectPayload<K>,
    effect: Extract<Effect, Readonly<Record<K, unknown>>>,
    index: number,
  ) => void;
  readonly completeValidation?: () => void;
}

/** Converts named, typed opcode adapters into the uniform applier port. */
export function createBehaviourEffectWriter(
  adapters: BehaviourEffectAdapters,
  validate: BehaviourEffectWriter['validate'] = () => undefined,
  completeValidation?: () => void,
): BehaviourEffectWriter {
  return {
    validate,
    ...(completeValidation === undefined ? {} : { completeValidation }),
    apply: (kind, payload, effect, index) => {
      // The call is safe because each tuple comes from the matching exhaustive
      // discriminant arm in applyBehaviourEffects below.
      const adapter = adapters[kind] as (
        value: typeof payload,
        source: typeof effect,
        effectIndex: number,
      ) => void;
      adapter(payload, effect, index);
    },
  };
}

/**
 * Starts an authority adapter fail-closed. Downstream behaviour lanes override
 * only the opcodes whose row preconditions and mutations they own.
 */
export function rejectingBehaviourEffectAdapters(
  reject: (kind: BehaviourEffectKind) => never,
): BehaviourEffectAdapters {
  return {
    setState: () => reject('setState'),
    toggleState: () => reject('toggleState'),
    incrementState: () => reject('incrementState'),
    giveItem: () => reject('giveItem'),
    consumeSelected: () => reject('consumeSelected'),
    consumeItem: () => reject('consumeItem'),
    damageSelected: () => reject('damageSelected'),
    spawnWorldItem: () => reject('spawnWorldItem'),
    pickupAsItem: () => reject('pickupAsItem'),
    openFrame: () => reject('openFrame'),
    closeFrame: () => reject('closeFrame'),
    startProcess: () => reject('startProcess'),
    settleProcess: () => reject('settleProcess'),
    claimProcessJob: () => reject('claimProcessJob'),
    sealContainer: () => reject('sealContainer'),
    spawnObject: () => reject('spawnObject'),
    despawnObject: () => reject('despawnObject'),
    spawnNpc: () => reject('spawnNpc'),
    teleport: () => reject('teleport'),
    usePortal: () => reject('usePortal'),
    grantBronze: () => reject('grantBronze'),
    chargeBronze: () => reject('chargeBronze'),
    grantExperience: () => reject('grantExperience'),
    applyEffect: () => reject('applyEffect'),
    learnRecipes: () => reject('learnRecipes'),
    statistic: () => reject('statistic'),
    questAction: () => reject('questAction'),
    say: () => reject('say'),
    bark: () => reject('bark'),
    sfx: () => reject('sfx'),
    animation: () => reject('animation'),
    setCollision: () => reject('setCollision'),
    setLight: () => reject('setLight'),
    scheduleTimer: () => reject('scheduleTimer'),
    carry: () => reject('carry'),
    placeCarried: () => reject('placeCarried'),
    plantSeed: () => reject('plantSeed'),
    farmTool: () => reject('farmTool'),
    worldTool: () => reject('worldTool'),
    meleeAttack: () => reject('meleeAttack'),
    fishing: () => reject('fishing'),
    bowAction: () => reject('bowAction'),
    mount: () => reject('mount'),
    dismount: () => reject('dismount'),
    foundHomestead: () => reject('foundHomestead'),
    rollLoot: () => reject('rollLoot'),
    fail: () => reject('fail'),
  };
}

export type BehaviourErrorFactory = (message: string) => Error;

function validateBatch(
  effects: readonly Effect[],
  writer: BehaviourEffectWriter,
  error: BehaviourErrorFactory,
): void {
  if (effects.length > MAX_EFFECTS_PER_HANDLER_RESULT) {
    throw error('behaviour_effect_cap_exceeded');
  }
  let spawnCount = 0;
  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index]!;
    const kind = effectKind(effect);
    if (kind === null) throw error('behaviour_effect_invalid');
    if (kind === 'spawnWorldItem' || kind === 'spawnObject' || kind === 'spawnNpc') {
      spawnCount += 1;
      if (spawnCount > MAX_SPAWN_EFFECTS_PER_EVENT) {
        throw error('behaviour_spawn_cap_exceeded');
      }
    }
    if ('scheduleTimer' in effect) {
      const ticks = effect.scheduleTimer.afterTicks;
      if (!Number.isSafeInteger(ticks) || ticks < 1 || ticks > MAX_TIMER_HORIZON_TICKS) {
        throw error('behaviour_timer_horizon_invalid');
      }
    }
    if ('grantBronze' in effect && (!Number.isSafeInteger(effect.grantBronze)
      || effect.grantBronze < 0)) throw error('behaviour_amount_invalid');
    if ('chargeBronze' in effect && (!Number.isSafeInteger(effect.chargeBronze)
      || effect.chargeBronze < 0)) throw error('behaviour_amount_invalid');
    if ('fail' in effect) throw error(effect.fail);
    writer.validate(kind, effect, index);
  }
  writer.completeValidation?.();
}

function unreachableEffect(effect: never, error: BehaviourErrorFactory): never {
  throw error(`behaviour_effect_invalid:${String(effect)}`);
}

/** Applies a validated effect list in declaration order inside one reducer transaction. */
export function applyBehaviourEffects(
  effects: readonly Effect[],
  writer: BehaviourEffectWriter,
  error: BehaviourErrorFactory = (message) => new Error(message),
): void {
  validateBatch(effects, writer, error);
  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index]!;
    if ('setState' in effect) writer.apply('setState', effect.setState, effect, index);
    else if ('toggleState' in effect) writer.apply('toggleState', effect.toggleState, effect, index);
    else if ('incrementState' in effect) writer.apply('incrementState', effect.incrementState, effect, index);
    else if ('giveItem' in effect) writer.apply('giveItem', effect.giveItem, effect, index);
    else if ('consumeSelected' in effect) writer.apply('consumeSelected', effect.consumeSelected, effect, index);
    else if ('consumeItem' in effect) writer.apply('consumeItem', effect.consumeItem, effect, index);
    else if ('damageSelected' in effect) writer.apply('damageSelected', effect.damageSelected, effect, index);
    else if ('spawnWorldItem' in effect) writer.apply('spawnWorldItem', effect.spawnWorldItem, effect, index);
    else if ('pickupAsItem' in effect) writer.apply('pickupAsItem', effect.pickupAsItem, effect, index);
    else if ('openFrame' in effect) writer.apply('openFrame', effect.openFrame, effect, index);
    else if ('closeFrame' in effect) writer.apply('closeFrame', effect.closeFrame, effect, index);
    else if ('startProcess' in effect) writer.apply('startProcess', effect.startProcess, effect, index);
    else if ('settleProcess' in effect) writer.apply('settleProcess', effect.settleProcess, effect, index);
    else if ('claimProcessJob' in effect) writer.apply('claimProcessJob', effect.claimProcessJob, effect, index);
    else if ('sealContainer' in effect) writer.apply('sealContainer', effect.sealContainer, effect, index);
    else if ('spawnObject' in effect) writer.apply('spawnObject', effect.spawnObject, effect, index);
    else if ('despawnObject' in effect) writer.apply('despawnObject', effect.despawnObject, effect, index);
    else if ('spawnNpc' in effect) writer.apply('spawnNpc', effect.spawnNpc, effect, index);
    else if ('teleport' in effect) writer.apply('teleport', effect.teleport, effect, index);
    else if ('usePortal' in effect) writer.apply('usePortal', effect.usePortal, effect, index);
    else if ('grantBronze' in effect) writer.apply('grantBronze', effect.grantBronze, effect, index);
    else if ('chargeBronze' in effect) writer.apply('chargeBronze', effect.chargeBronze, effect, index);
    else if ('grantExperience' in effect) writer.apply('grantExperience', effect.grantExperience, effect, index);
    else if ('applyEffect' in effect) writer.apply('applyEffect', effect.applyEffect, effect, index);
    else if ('learnRecipes' in effect) writer.apply('learnRecipes', effect.learnRecipes, effect, index);
    else if ('statistic' in effect) writer.apply('statistic', effect.statistic, effect, index);
    else if ('questAction' in effect) writer.apply('questAction', effect.questAction, effect, index);
    else if ('say' in effect) writer.apply('say', effect.say, effect, index);
    else if ('bark' in effect) writer.apply('bark', effect.bark, effect, index);
    else if ('sfx' in effect) writer.apply('sfx', effect.sfx, effect, index);
    else if ('animation' in effect) writer.apply('animation', effect.animation, effect, index);
    else if ('setCollision' in effect) writer.apply('setCollision', effect.setCollision, effect, index);
    else if ('setLight' in effect) writer.apply('setLight', effect.setLight, effect, index);
    else if ('scheduleTimer' in effect) writer.apply('scheduleTimer', effect.scheduleTimer, effect, index);
    else if ('carry' in effect) writer.apply('carry', effect.carry, effect, index);
    else if ('placeCarried' in effect) writer.apply('placeCarried', effect.placeCarried, effect, index);
    else if ('plantSeed' in effect) writer.apply('plantSeed', effect.plantSeed, effect, index);
    else if ('farmTool' in effect) writer.apply('farmTool', effect.farmTool, effect, index);
    else if ('worldTool' in effect) writer.apply('worldTool', effect.worldTool, effect, index);
    else if ('meleeAttack' in effect) writer.apply('meleeAttack', effect.meleeAttack, effect, index);
    else if ('fishing' in effect) writer.apply('fishing', effect.fishing, effect, index);
    else if ('bowAction' in effect) writer.apply('bowAction', effect.bowAction, effect, index);
    else if ('mount' in effect) writer.apply('mount', effect.mount, effect, index);
    else if ('dismount' in effect) writer.apply('dismount', effect.dismount, effect, index);
    else if ('foundHomestead' in effect) writer.apply('foundHomestead', effect.foundHomestead, effect, index);
    else if ('rollLoot' in effect) writer.apply('rollLoot', effect.rollLoot, effect, index);
    else if ('fail' in effect) writer.apply('fail', effect.fail, effect, index);
    else unreachableEffect(effect, error);
  }
}

/** Guards the switch against vocabulary drift in addition to TypeScript exhaustiveness. */
export const APPLIED_EFFECT_KINDS: readonly BehaviourEffectKind[] = Object.freeze(
  EFFECT_OPCODES.map(({ kind }) => kind),
);
