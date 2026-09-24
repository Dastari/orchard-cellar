/**
 * Test-only gear catalogue (Gear-D1/D2 staged rollout).
 *
 * The `gear` content kind's reader ships first, while the committed bootstrap
 * pack carries no gear rows (`packages/assets/content/gear.json` is `[]`). That
 * keeps the runtime payload inside its budget and keeps older readers, which
 * reject unknown kinds, safe. The full 145-row catalogue lives in
 * `fixtures/gear-catalogue.fixture.json` until gear content is published with
 * its own reviewed payload plan (wiki: Roadmap/Gear & Equipment Build, B2/B3).
 * Do not import this module from runtime code.
 */
import fixtureJson from './fixtures/gear-catalogue.fixture.json' with { type: 'json' };
import { bootstrapContentRows } from './bootstrap-registry.js';
import { definitionSlug } from './definition-id.js';
import type { ContentDefinitionRow } from './definitions.js';
import { compileGearCatalogue, type GearCatalogue } from './gear-catalogue.js';
import { buildContentRegistry, type BuildContentRegistryResult } from './registry.js';

const FIXTURE: readonly { readonly id: string }[] = fixtureJson as readonly { readonly id: string }[];

/** The fixture catalogue as content rows of kind `gear`. */
export function gearFixtureRows(): readonly ContentDefinitionRow[] {
  return FIXTURE.map((row) => ({ id: row.id, kind: 'gear', slug: definitionSlug(row.id)!, json: JSON.stringify(row) }));
}

/** The committed bootstrap pack plus the fixture gear catalogue. */
export function bootstrapRowsWithGearFixture(): readonly ContentDefinitionRow[] {
  return [...bootstrapContentRows(), ...gearFixtureRows()];
}

let cached: BuildContentRegistryResult | undefined;
export function gearFixtureRegistry(): BuildContentRegistryResult {
  cached ??= buildContentRegistry(bootstrapRowsWithGearFixture());
  return cached;
}

let catalogue: GearCatalogue | undefined;
export function gearFixtureCatalogue(): GearCatalogue {
  catalogue ??= compileGearCatalogue(gearFixtureRegistry().registry.gear.values()) ?? undefined;
  if (catalogue === undefined) throw new Error('gear_fixture_rules_missing');
  return catalogue;
}
