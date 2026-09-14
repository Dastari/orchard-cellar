import { CONTENT_SCHEMA_VERSION, ContentParseError } from './parse-contract.js';
import type { ItemDefinitionId } from './definitions.js';

export type LoadoutDefinitionId = `loadout:${string}`;
export type AbilityDefinitionId = `ability:${string}`;
export type LoadoutRole = 'new_player';

export interface PlayerAppearanceCatalogDefinition {
  readonly hairKinds: readonly string[];
  readonly shirtKinds: readonly string[];
  readonly pantsKinds: readonly string[];
  readonly shoesKinds: readonly string[];
}

export interface SprintAbilityContentDefinition {
  readonly id: AbilityDefinitionId;
  readonly adapter: 'sprint';
  readonly displayName: string;
  readonly input: string;
  readonly primaryAttribute: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  readonly tags: readonly string[];
  readonly modifierTargets: readonly ['sprintSpeed', 'sprintVigourCost'];
  readonly speedPermille: number;
  readonly vigourDrainCentiPerSecond: number;
  readonly baselineAttribute: number;
}

export interface LoadoutEntryDefinition {
  readonly item: ItemDefinitionId;
  readonly quantity: number;
  readonly slot: number;
  /** Omitted preserves the persisted inventory default of an enabled item. */
  readonly lit?: boolean;
}

export interface LoadoutContentDefinition {
  readonly id: LoadoutDefinitionId;
  readonly kind: 'loadout';
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly role: LoadoutRole;
  readonly selectedSlot: number;
  readonly entries: readonly LoadoutEntryDefinition[];
  readonly appearance: PlayerAppearanceCatalogDefinition;
  readonly abilities: readonly SprintAbilityContentDefinition[];
  readonly retired?: boolean;
  readonly replacement?: LoadoutDefinitionId;
}

const LOADOUT_ID = /^loadout:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const ITEM_ID = /^item:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const ABILITY_ID = /^ability:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const CATALOG_VALUE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const MAX_INVENTORY_SLOT = 255;
const MAX_STACK_QUANTITY = 65_535;

function fail(path: string, message: string): never {
  throw new ContentParseError('invalid_type', path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
}

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(path, `expected a safe integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function loadoutId(value: unknown, path: string): LoadoutDefinitionId {
  if (typeof value !== 'string' || !LOADOUT_ID.test(value)) fail(path, 'invalid loadout definition id');
  return value as LoadoutDefinitionId;
}

function itemId(value: unknown, path: string): ItemDefinitionId {
  if (typeof value !== 'string' || !ITEM_ID.test(value)) fail(path, 'invalid item definition id');
  return value as ItemDefinitionId;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(path, 'expected a non-empty string');
  return value;
}

function stringCatalog(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    fail(path, 'expected one to 64 catalog values');
  }
  const values = value.map((entry, index) => {
    const parsed = nonEmptyString(entry, `${path}[${index}]`);
    if (!CATALOG_VALUE.test(parsed)) fail(`${path}[${index}]`, 'invalid appearance catalog value');
    return parsed;
  });
  if (new Set(values).size !== values.length) fail(path, 'appearance catalog values must be unique');
  return Object.freeze(values);
}

function parseAppearanceCatalog(value: unknown, path: string): PlayerAppearanceCatalogDefinition {
  const source = record(value, path);
  return Object.freeze({
    hairKinds: stringCatalog(source.hairKinds, `${path}.hairKinds`),
    shirtKinds: stringCatalog(source.shirtKinds, `${path}.shirtKinds`),
    pantsKinds: stringCatalog(source.pantsKinds, `${path}.pantsKinds`),
    shoesKinds: stringCatalog(source.shoesKinds, `${path}.shoesKinds`),
  });
}

function parseSprintAbility(value: unknown, path: string): SprintAbilityContentDefinition {
  const source = record(value, path);
  if (typeof source.id !== 'string' || !ABILITY_ID.test(source.id)) fail(`${path}.id`, 'invalid ability definition id');
  if (source.adapter !== 'sprint') fail(`${path}.adapter`, 'unsupported ability adapter');
  const primaryAttribute = nonEmptyString(source.primaryAttribute, `${path}.primaryAttribute`);
  if (!['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(primaryAttribute)) {
    fail(`${path}.primaryAttribute`, 'unsupported primary attribute');
  }
  if (!Array.isArray(source.tags) || source.tags.length === 0 || source.tags.length > 32) {
    fail(`${path}.tags`, 'expected one to 32 ability tags');
  }
  const tags = source.tags.map((tag, index) => nonEmptyString(tag, `${path}.tags[${index}]`));
  if (new Set(tags).size !== tags.length) fail(`${path}.tags`, 'ability tags must be unique');
  if (!Array.isArray(source.modifierTargets)
    || source.modifierTargets.length !== 2
    || source.modifierTargets[0] !== 'sprintSpeed'
    || source.modifierTargets[1] !== 'sprintVigourCost') {
    fail(`${path}.modifierTargets`, 'sprint requires speed and Vigour modifier targets');
  }
  return Object.freeze({
    id: source.id as AbilityDefinitionId,
    adapter: 'sprint',
    displayName: nonEmptyString(source.displayName, `${path}.displayName`),
    input: nonEmptyString(source.input, `${path}.input`),
    primaryAttribute: primaryAttribute as SprintAbilityContentDefinition['primaryAttribute'],
    tags: Object.freeze(tags),
    modifierTargets: Object.freeze(['sprintSpeed', 'sprintVigourCost'] as const),
    speedPermille: integer(source.speedPermille, `${path}.speedPermille`, 1, 4_000),
    vigourDrainCentiPerSecond: integer(source.vigourDrainCentiPerSecond, `${path}.vigourDrainCentiPerSecond`, 0, 65_535),
    baselineAttribute: integer(source.baselineAttribute, `${path}.baselineAttribute`, 1, 255),
  });
}

export function parseLoadoutDefinition(json: string | unknown): LoadoutContentDefinition {
  let decoded: unknown;
  try { decoded = typeof json === 'string' ? JSON.parse(json) : json; }
  catch (error) {
    throw new ContentParseError('invalid_json', '$', error instanceof Error ? error.message : 'invalid JSON');
  }
  const source = record(decoded, '$');
  const id = loadoutId(source.id, '$.id');
  if (source.kind !== undefined && source.kind !== 'loadout') fail('$.kind', 'expected loadout');
  if (integer(source.schemaVersion, '$.schemaVersion', 1, Number.MAX_SAFE_INTEGER) !== CONTENT_SCHEMA_VERSION) {
    throw new ContentParseError('unsupported_schema_version', '$.schemaVersion', 'unsupported loadout schema version');
  }
  if (source.role !== 'new_player') fail('$.role', 'unsupported loadout role');
  if (!Array.isArray(source.entries) || source.entries.length === 0 || source.entries.length > 256) {
    fail('$.entries', 'expected one to 256 loadout entries');
  }
  const slots = new Set<number>();
  const entries = source.entries.map((value, index): LoadoutEntryDefinition => {
    const path = `$.entries[${index}]`;
    const entry = record(value, path);
    const slot = integer(entry.slot, `${path}.slot`, 0, MAX_INVENTORY_SLOT);
    if (slots.has(slot)) fail(`${path}.slot`, `duplicate loadout slot ${slot}`);
    slots.add(slot);
    if (entry.lit !== undefined && typeof entry.lit !== 'boolean') fail(`${path}.lit`, 'expected a boolean');
    return Object.freeze({
      item: itemId(entry.item, `${path}.item`),
      quantity: integer(entry.quantity, `${path}.quantity`, 1, MAX_STACK_QUANTITY),
      slot,
      ...(entry.lit === undefined ? {} : { lit: entry.lit }),
    });
  });
  const selectedSlot = integer(source.selectedSlot, '$.selectedSlot', 0, MAX_INVENTORY_SLOT);
  if (!slots.has(selectedSlot)) fail('$.selectedSlot', 'selected slot must contain a loadout entry');
  if (source.retired !== undefined && typeof source.retired !== 'boolean') fail('$.retired', 'expected a boolean');
  if (!Array.isArray(source.abilities) || source.abilities.length === 0 || source.abilities.length > 32) {
    fail('$.abilities', 'expected one to 32 abilities');
  }
  const abilities = source.abilities.map((ability, index) => parseSprintAbility(ability, `$.abilities[${index}]`));
  if (new Set(abilities.map(({ id: abilityId }) => abilityId)).size !== abilities.length) {
    fail('$.abilities', 'ability ids must be unique');
  }
  return Object.freeze({
    id,
    kind: 'loadout',
    schemaVersion: CONTENT_SCHEMA_VERSION,
    role: 'new_player',
    selectedSlot,
    entries: Object.freeze(entries),
    appearance: parseAppearanceCatalog(source.appearance, '$.appearance'),
    abilities: Object.freeze(abilities),
    ...(source.retired === undefined ? {} : { retired: source.retired }),
    ...(source.replacement === undefined ? {} : { replacement: loadoutId(source.replacement, '$.replacement') }),
  });
}
