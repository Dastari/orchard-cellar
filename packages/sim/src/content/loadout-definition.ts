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

/** The carried containers a starter kit may fill (never the stash, which the legacy numbering never addressed). */
export type LoadoutContainerId = 'hotbar' | 'backpack' | 'equipment' | 'crafting';
const LOADOUT_CONTAINERS: readonly LoadoutContainerId[] = ['hotbar', 'backpack', 'equipment', 'crafting'];

export interface LoadoutCellDefinition {
  readonly container: LoadoutContainerId;
  readonly index: number;
}

export interface LoadoutEntryDefinition {
  readonly item: ItemDefinitionId;
  readonly quantity: number;
  /** Legacy global slot (hotbar 0-9, backpack 10-29, equipment 30-39, crafting 40-48). Give this or `cell`;
   * one loadout uses one form throughout. Translated once through the frozen legacy layout. */
  readonly slot?: number;
  /** The starter cell by container and index. Give this or the legacy `slot`; one loadout uses one form throughout. */
  readonly cell?: LoadoutCellDefinition;
  /** Omitted preserves the persisted inventory default of an enabled item. */
  readonly lit?: boolean;
}

export interface LoadoutContentDefinition {
  readonly id: LoadoutDefinitionId;
  readonly kind: 'loadout';
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly role: LoadoutRole;
  /** Legacy global slot of the selected entry; used with legacy `slot` entries. */
  readonly selectedSlot?: number;
  /** The selected entry's cell (a hotbar cell or the Main Hand); used with `cell` entries. */
  readonly selectedCell?: LoadoutCellDefinition;
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
/** A u32 cell index; the new-player plan checks the index against the container's capacity. */
const MAX_CELL_INDEX = 0xffff_ffff;

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

function loadoutCell(value: unknown, path: string): LoadoutCellDefinition {
  const source = record(value, path);
  if (!LOADOUT_CONTAINERS.includes(source.container as LoadoutContainerId)) {
    fail(`${path}.container`, `expected one of ${LOADOUT_CONTAINERS.join(', ')}`);
  }
  return Object.freeze({
    container: source.container as LoadoutContainerId,
    index: integer(source.index, `${path}.index`, 0, MAX_CELL_INDEX),
  });
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
  // One loadout uses one addressing form throughout: legacy global `slot` numbers with `selectedSlot`, or container
  // `cell`s with `selectedCell`. Mixed forms would need the legacy conversion here to find a shared cell.
  const cellForm = source.selectedCell !== undefined;
  if (cellForm === (source.selectedSlot !== undefined)) fail('$.selectedSlot', 'expected exactly one of selectedSlot or selectedCell');
  const occupied = new Set<string>();
  const entries = source.entries.map((value, index): LoadoutEntryDefinition => {
    const path = `$.entries[${index}]`;
    const entry = record(value, path);
    let address: Pick<LoadoutEntryDefinition, 'slot' | 'cell'>;
    if (cellForm) {
      if (entry.slot !== undefined) fail(`${path}.slot`, 'a loadout with selectedCell addresses entries by cell');
      const cell = loadoutCell(entry.cell, `${path}.cell`);
      const key = `${cell.container}:${cell.index}`;
      if (occupied.has(key)) fail(`${path}.cell`, `duplicate loadout cell ${key}`);
      occupied.add(key);
      address = { cell };
    } else {
      if (entry.cell !== undefined) fail(`${path}.cell`, 'a loadout with selectedSlot addresses entries by legacy slot');
      const slot = integer(entry.slot, `${path}.slot`, 0, MAX_INVENTORY_SLOT);
      if (occupied.has(String(slot))) fail(`${path}.slot`, `duplicate loadout slot ${slot}`);
      occupied.add(String(slot));
      address = { slot };
    }
    if (entry.lit !== undefined && typeof entry.lit !== 'boolean') fail(`${path}.lit`, 'expected a boolean');
    return Object.freeze({
      item: itemId(entry.item, `${path}.item`),
      quantity: integer(entry.quantity, `${path}.quantity`, 1, MAX_STACK_QUANTITY),
      ...address,
      ...(entry.lit === undefined ? {} : { lit: entry.lit }),
    });
  });
  let selection: Pick<LoadoutContentDefinition, 'selectedSlot' | 'selectedCell'>;
  if (cellForm) {
    const selectedCell = loadoutCell(source.selectedCell, '$.selectedCell');
    if (!occupied.has(`${selectedCell.container}:${selectedCell.index}`)) {
      fail('$.selectedCell', 'selected cell must contain a loadout entry');
    }
    selection = { selectedCell };
  } else {
    const selectedSlot = integer(source.selectedSlot, '$.selectedSlot', 0, MAX_INVENTORY_SLOT);
    if (!occupied.has(String(selectedSlot))) fail('$.selectedSlot', 'selected slot must contain a loadout entry');
    selection = { selectedSlot };
  }
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
    ...selection,
    entries: Object.freeze(entries),
    appearance: parseAppearanceCatalog(source.appearance, '$.appearance'),
    abilities: Object.freeze(abilities),
    ...(source.retired === undefined ? {} : { retired: source.retired }),
    ...(source.replacement === undefined ? {} : { replacement: loadoutId(source.replacement, '$.replacement') }),
  });
}
