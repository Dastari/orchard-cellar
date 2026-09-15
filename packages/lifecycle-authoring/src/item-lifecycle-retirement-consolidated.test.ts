import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface CapabilityManifest {
  readonly selectedItemBranches: readonly {
    readonly id: string;
    readonly classification: string;
    readonly status: string;
  }[];
  readonly specializedSurfaces: readonly {
    readonly id: string;
    readonly clientMethods: readonly string[];
    readonly serverReducers: readonly string[];
    readonly disposition: string;
  }[];
}

const manifest = JSON.parse(readFileSync(
  new URL('../audit/selected-item-capability-manifest.json', import.meta.url),
  'utf8',
)) as CapabilityManifest;
const client = readFileSync(new URL('../../client/src/overworld-main.ts', import.meta.url), 'utf8');
const clientCapabilities = readFileSync(
  new URL('../../client/src/selected-item-use.ts', import.meta.url),
  'utf8',
);
const connection = readFileSync(
  new URL('../../client/src/net/overworld-connection.ts', import.meta.url),
  'utf8',
);
const dispatcher = readFileSync(
  new URL('../../world/src/behaviour/use-selected.ts', import.meta.url),
  'utf8',
);
const world = readFileSync(new URL('../../world/src/index.ts', import.meta.url), 'utf8');
const metadata = JSON.parse(readFileSync(
  new URL('../generated/item-lifecycle-metadata.json', import.meta.url),
  'utf8',
)) as { readonly handlers: readonly {
  readonly itemId: string;
  readonly triggers: readonly string[];
}[] };

const interactiveKinds = [
  'axe', 'pickaxe', 'sword', 'bow', 'fishing_rod', 'hoe', 'watering_can', 'lantern', 'torch',
] as const;

function slice(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, start).toBeGreaterThanOrEqual(0);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
}

function snake(value: string): string {
  return value.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}

describe('consolidated item lifecycle retirement boundary', () => {
  it('has no unfinished selected-item ownership status or temporary surface exception', () => {
    expect(manifest.selectedItemBranches.filter(({ classification, status }) => (
      classification === 'item-owned-onUse' && status !== 'migrated'
    ))).toEqual([]);
    expect(manifest.specializedSurfaces.filter(({ disposition }) => (
      disposition.startsWith('temporarily-')
    ))).toEqual([]);
  });

  it('forbids every retired specialized reducer, client method, and generated binding', () => {
    const retired = manifest.specializedSurfaces.find(({ id }) => id === 'retired-item-action-surfaces');
    expect(retired?.disposition).toBe('forbid');
    expect(retired?.clientMethods).toEqual(retired?.serverReducers);
    for (const name of retired?.clientMethods ?? []) {
      expect(connection, `client method ${name}`).not.toMatch(new RegExp(`\\n\\s{2}${name}\\(`, 'u'));
      expect(world, `world reducer ${name}`).not.toContain(`export const ${name} = spacetimedb.reducer`);
      expect(
        existsSync(new URL(`../../world-bindings/src/${snake(name)}_reducer.ts`, import.meta.url)),
        `binding ${snake(name)}_reducer.ts`,
      ).toBe(false);
    }
  });

  it('keeps capability selection metadata-derived in client input dispatch', () => {
    const keyDispatch = slice(client, "if (event.code === 'KeyF'", "if (event.code === 'KeyE'");
    const pointerDispatch = slice(
      client,
      "canvas.addEventListener('pointerdown'",
      "canvas.addEventListener('pointerup'",
    );
    for (const kind of interactiveKinds) {
      const exactKind = new RegExp(`(?:===|!==)\\s*['"]${kind}['"]`, 'u');
      expect(keyDispatch, `KeyF ${kind}`).not.toMatch(exactKind);
      expect(pointerDispatch, `pointer ${kind}`).not.toMatch(exactKind);
      expect(clientCapabilities, `capability helper ${kind}`).not.toMatch(exactKind);
    }
    for (const source of [client, clientCapabilities]) {
      expect(source).not.toMatch(/handler\.id\s*(?:===|!==)/u);
      expect(source).not.toMatch(/handler\.id\.(?:endsWith|includes|startsWith)\(/u);
    }
    expect(clientCapabilities).toContain('CODE_ACTION_BY_ITEM_EVENT.get(');
    expect(clientCapabilities).toContain("selectedItemLifecycleAction(definition, 'useAt')");
    expect(clientCapabilities).toContain("selectedItemLifecycleAction(definition, 'useWith')");
  });

  it('selects server capability only from authoritative rows and the compiled registry', () => {
    for (const kind of interactiveKinds) expect(dispatcher, kind).not.toContain(`'${kind}'`);
    expect(dispatcher).not.toMatch(/handler\.id\s*(?:===|!==)/u);
    expect(dispatcher).toContain('const selected = authority.selectedItem(ctx);');
    expect(dispatcher).toContain('const equipment = authority.equipmentItem(ctx, request.equipmentSlot);');
    expect(dispatcher).toContain('raiseEvent(authority.handlers(ctx)');
    // Process control is deliberately a target-owned engine operation, not a
    // selected inventory-item capability lane.
    expect(dispatcher).toContain('authority.performFrameAction?.(ctx, actionId) !== true');
  });

  it('publishes authored triggers for every migrated interactive item category', () => {
    const triggers = (itemId: string) => new Set(metadata.handlers
      .filter((handler) => handler.itemId === itemId)
      .flatMap(({ triggers: values }) => values));
    const expected = new Map<string, readonly string[]>([
      ['item:axe', ['secondary', 'useWith']],
      ['item:pickaxe', ['secondary', 'useWith', 'useAt']],
      ['item:sword', ['secondary', 'useWith']],
      ['item:bow', ['aimedUse', 'useWith']],
      ['item:fishing_rod', ['useAt', 'useWith']],
      ['item:hoe', ['place', 'secondary', 'useWith']],
      ['item:watering_can', ['place', 'useWith']],
      ['item:lantern', ['equipmentUse', 'worldItemUse']],
      ['item:torch', ['equipmentUse', 'worldItemUse']],
    ]);
    for (const [itemId, required] of expected) {
      expect([...triggers(itemId)].sort(), itemId).toEqual([...required].sort());
    }
  });
});
