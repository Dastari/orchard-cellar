import { gameplayPainterAuditSource } from './gameplay-painter-audit.test-support.js';
import { existsSync, readFileSync } from 'node:fs';
import {
  bootstrapContentRegistry,
  createHandlerRegistry,
  registerLootHandlers,
  registerPlaceableHandlers,
  registerProcessorHandlers,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';

import { AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS } from '../generated/item-lifecycles.js';

type Classification =
  | 'item-owned-onUse'
  | 'object-tile-entity-owned-lifecycle'
  | 'pure-presentation'
  | 'engine-control';

interface AuditManifest {
  readonly format: string;
  readonly classifications: readonly Classification[];
  readonly explicitSelectedKinds: readonly string[];
  readonly derivedCapabilityRules: readonly {
    readonly id: string;
    readonly requiredTrigger: string;
  }[];
  readonly selectedItemBranches: readonly {
    readonly id: string;
    readonly anchor: string;
    readonly selectedKinds: readonly string[];
    readonly classification: Classification;
    readonly status: string;
  }[];
  readonly specializedSurfaces: readonly {
    readonly id: string;
    readonly itemId?: string;
    readonly readyWhenTriggers?: readonly string[];
    readonly clientMethods: readonly string[];
    readonly serverReducers: readonly string[];
    readonly bindings?: readonly string[];
    readonly classification: Classification;
    readonly disposition: string;
  }[];
  readonly nextMigrations: readonly {
    readonly priority: number;
    readonly id: string;
    readonly currentOwner: string;
    readonly targetOwner: string;
    readonly retirement: readonly string[];
  }[];
}

const manifest = JSON.parse(readFileSync(
  new URL('../audit/selected-item-capability-manifest.json', import.meta.url),
  'utf8',
)) as AuditManifest;
const metadata = JSON.parse(readFileSync(
  new URL('../generated/item-lifecycle-metadata.json', import.meta.url),
  'utf8',
)) as { readonly handlers: readonly {
  readonly itemId: string;
  readonly triggers: readonly string[];
}[] };
const lifecycleSource = JSON.parse(readFileSync(
  new URL('../source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as { readonly handlers: readonly {
  readonly itemId: string;
  readonly source: string;
  readonly triggers?: readonly string[];
}[] };
const clientSource = gameplayPainterAuditSource();
const connectionSource = readFileSync(
  new URL('../../client/src/net/overworld-connection.ts', import.meta.url),
  'utf8',
);
const worldSource = readFileSync(new URL('../../world/src/index.ts', import.meta.url), 'utf8');
const itemBridgeUrl = new URL('../../sim/src/behaviour/handlers/items.ts', import.meta.url);
const simIndexSource = readFileSync(new URL('../../sim/src/index.ts', import.meta.url), 'utf8');
const placeableBridgeSource = readFileSync(
  new URL('../../sim/src/behaviour/handlers/placeables.ts', import.meta.url),
  'utf8',
);

function metadataTriggers(itemId: string): ReadonlySet<string> {
  return new Set(metadata.handlers
    .filter((handler) => handler.itemId === itemId)
    .flatMap(({ triggers }) => triggers));
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}

function expectSurfaceAbsent(
  clientMethod: string,
  serverReducer = clientMethod,
  binding = `${camelToSnake(serverReducer)}_reducer.ts`,
): void {
  expect(connectionSource, `client method ${clientMethod}`).not.toMatch(
    new RegExp(`\\n\\s{2}${clientMethod}\\(`, 'u'),
  );
  expect(worldSource, `server reducer ${serverReducer}`)
    .not.toContain(`export const ${serverReducer} = spacetimedb.reducer`);
  expect(existsSync(new URL(`../../world-bindings/src/${binding}`, import.meta.url)), binding)
    .toBe(false);
}

describe('selected-item lifecycle capability audit', () => {
  it('keeps every explicit selected-kind branch classified and anchored', () => {
    expect(manifest.format).toBe('orchard-selected-item-capability-audit-v1');
    expect(new Set(manifest.classifications)).toEqual(new Set<Classification>([
      'item-owned-onUse',
      'object-tile-entity-owned-lifecycle',
      'pure-presentation',
      'engine-control',
    ]));
    const discovered = [...new Set([...clientSource.matchAll(
      /(?:selectedItem\([^)]*\)|selectedUseKind|farmItem|itemKind|equipped)\s*(?:===|!==)\s*'([^']+)'/gu,
    )].map((match) => match[1]))].sort();
    expect(manifest.explicitSelectedKinds).toEqual(discovered);
    expect(new Set(manifest.selectedItemBranches.map(({ id }) => id)).size)
      .toBe(manifest.selectedItemBranches.length);
    for (const branch of manifest.selectedItemBranches) {
      expect(manifest.classifications, branch.id).toContain(branch.classification);
      expect(branch.selectedKinds.length, branch.id).toBeGreaterThan(0);
      expect(clientSource, branch.id).toContain(branch.anchor);
    }
  });

  it('derives every active item category from lifecycle metadata', () => {
    const registry = bootstrapContentRegistry();
    const liveItems = [...registry.items.values()].filter(({ retired }) => retired !== true);
    const expectedByRule = new Map<string, readonly string[]>([
      ['authored-data-direct-use', liveItems.filter(({ onUse }) => (
        onUse.some(({ verb }) => verb === 'secondary')
      )).map(({ id }) => id)],
      ['seed-placement', liveItems.filter(({ tags }) => tags.includes('item.seed')).map(({ id }) => id)],
      ['placeable-placement', [
        ...liveItems.filter(({ tags }) => tags.includes('item.placeable')).map(({ id }) => id),
        'item:boat',
        'item:homestead_deed',
      ]],
      ['durability-repair', liveItems.filter(({ durability }) => durability !== undefined).map(({ id }) => id)],
    ]);
    for (const rule of manifest.derivedCapabilityRules) {
      const expected = expectedByRule.get(rule.id);
      expect(expected, rule.id).toBeDefined();
      for (const itemId of expected ?? []) {
        expect([...metadataTriggers(itemId)], `${rule.id}: ${itemId}`).toContain(rule.requiredTrigger);
      }
    }
    const exactToolTriggers = new Map<string, readonly string[]>([
      ['item:axe', ['secondary', 'useWith']],
      ['item:pickaxe', ['secondary', 'useWith', 'useAt']],
      ['item:sword', ['secondary', 'useWith']],
      ['item:hoe', ['place', 'useWith']],
      ['item:watering_can', ['place', 'useWith']],
      ['item:fishing_rod', ['useAt', 'useWith']],
      ['item:bow', ['aimedUse', 'useWith']],
      ['item:lantern', ['equipmentUse', 'worldItemUse']],
      ['item:torch', ['equipmentUse', 'worldItemUse']],
    ]);
    for (const [itemId, expected] of exactToolTriggers) {
      expect([...metadataTriggers(itemId)].sort(), itemId).toEqual([...expected].sort());
    }
  });

  it('forbids retired item-action reducers, client methods, and bindings', () => {
    const retired = manifest.specializedSurfaces.find(({ id }) => id === 'retired-item-action-surfaces');
    expect(retired?.disposition).toBe('forbid');
    expect(retired?.clientMethods).toEqual(retired?.serverReducers);
    for (const name of retired?.clientMethods ?? []) expectSurfaceAbsent(name);
  });

  it('uses generated callbacks as the sole compiled item-code registrations', () => {
    expect(existsSync(itemBridgeUrl), 'empty compiled item-handler bridge must stay retired').toBe(false);
    expect(simIndexSource).not.toContain("./behaviour/handlers/items.js");
    expect(worldSource.match(
      /createHandlerRegistry\(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS\)/gu,
    )).toHaveLength(1);
    expect(worldSource).not.toContain('registerItemHandlers(');
    expect(worldSource).not.toContain('ITEM_HANDLER_REGISTRATIONS');

    const registry = bootstrapContentRegistry();
    const compiledBase = registerProcessorHandlers(
      registry.objects.values(),
      registerPlaceableHandlers(registerLootHandlers(
        createHandlerRegistry(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS),
      )),
    );
    const itemCodeIds = compiledBase.registrations
      .filter(({ source }) => source === 'selectedItem')
      .map(({ id }) => id);
    expect(itemCodeIds).toEqual(
      createHandlerRegistry(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS).registrations
        .map(({ id }) => id),
    );
    expect(new Set(itemCodeIds).size).toBe(itemCodeIds.length);
  });

  it('has no remaining temporary bow or fishing retirement exceptions', () => {
    const temporary = manifest.specializedSurfaces.filter(({ disposition }) => (
      disposition === 'temporarily-allow-until-metadata-ready'
    ));
    expect(temporary).toEqual([]);
  });

  it('retires completed portable-light and axe gaps while keeping the remaining gap explicit', () => {
    expect(manifest.nextMigrations.map(({ priority, id }) => ({ priority, id }))).toEqual([
      { priority: 1, id: 'repair-only-tools' },
      { priority: 2, id: 'fishing-cast-activation-pinning' },
    ]);

    expect(metadataTriggers('item:lantern')).toContain('equipmentUse');
    expect(metadataTriggers('item:lantern')).toContain('worldItemUse');
    expect(metadataTriggers('item:torch')).toContain('equipmentUse');
    expect(metadataTriggers('item:torch')).toContain('worldItemUse');
    expect(existsSync(itemBridgeUrl), 'empty compiled item-handler bridge must stay retired').toBe(false);
    const axe = lifecycleSource.handlers.find(({ itemId }) => itemId === 'item:axe');
    expect(axe?.source).toContain('chest');
    expect(clientSource).not.toContain("network.interactEntity('placeable', chest.id, 'break')");
    expect(placeableBridgeSource).not.toContain("id: 'placeable.chest-break'");
  });
});
