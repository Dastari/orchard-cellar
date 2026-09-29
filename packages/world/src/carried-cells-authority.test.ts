import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { useSelectedBehaviour, type UseSelectedAuthority } from './behaviour/use-selected.js';
import { CURRENT_PROTOCOL, PLAYER_CELL_HELPER_NAMES, playerCellDependencies, playerCellTable, type FixtureCellRow } from './player-cells.fixture.js';

/**
 * Uncapped Storage step 5: the world reads carried cells by container and index, with no legacy global-slot adapter.
 * The real index.ts functions run against fake tables; only persistence and unrelated services are replaced.
 */
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function authority(names: readonly string[], dependencies: Record<string, unknown>) {
  const definitions = names.map(name => {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (fn) return fn.getText(source);
    throw new Error(`Missing authority ${name}`);
  }).join('\n');
  const javascript = ts.transpileModule(`${definitions}\nreturn {${names.join(',')}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies));
}
function table<T>(initial: T | null) {
  let row = initial;
  const index = { find: () => row, update: (next: T) => { row = next; return row; } };
  return { identity: index, connectionId: index, id: index, insert: index.update };
}

const registry = sim.bootstrapContentRegistry();
const sender = { toHexString: () => 'cells-player', isEqual: (other: unknown) => other === sender };
function cell(container: string, index: number, itemKind: string, quantity = 1, durability = 0): FixtureCellRow {
  return { id: sim.playerContainerCellKey('cells-player', { container: container as sim.PlayerContainerId, index }),
    identity: sender, container, index, itemKind, quantity, durability, lit: true };
}

function fixture(cells: readonly FixtureCellRow[], options: { protocol?: number; selectedSlot?: number; content?: sim.ContentRegistry } = {}) {
  const content = options.content ?? registry;
  const ctx = {
    sender, connectionId: { toHexString: () => 'connection' },
    db: {
      player_container_cell: playerCellTable(cells),
      player_survival: table({ identity: sender, selectedSlot: options.selectedSlot ?? 0, debugBackpackSlots: 0 }),
      inventory_protocol: table({ identity: sender, version: options.protocol ?? CURRENT_PROTOCOL }),
      rogue_run_member: table(null),
      world_clock: table({ authorityTick: 0n }),
    },
  };
  const api = authority([
    'inventoryContainerCapacity', 'accessibleInventoryContainerCapacity', 'equippedInventoryCapacity', 'carriedInventoryFor',
    'carriedAmmunitionRows', 'expeditionPreparationFor', 'behaviourItemSnapshot', 'selectedBehaviourItem', 'equipmentBehaviourItem',
    'requireInventoryProtocol', 'requirePersistentInventoryAvailable', 'rogueRunForIdentity', ...PLAYER_CELL_HELPER_NAMES,
  ], {
    ...sim, ...playerCellDependencies, SenderError: Error, contentRegistry: () => content,
    DEFAULT_BACKPACK_CAPACITY: sim.BASE_BACKPACK_CAPACITY,
    activeItemContainerContent: () => sim.itemContainerContentResolver(content),
    requireCombatActionReady: () => {},
  });
  return { ctx, api };
}

/** A registry whose first authored bag grants `capacity` backpack cells; the bag goes in the Pack cell. */
function withBag(capacity: number): { readonly content: sim.ContentRegistry; readonly bag: string } {
  const bag = [...registry.items.values()].find(item => item.equip?.inventoryCapacity !== undefined && item.retired !== true)!;
  const items = new Map(registry.items).set(bag.id, { ...bag, equip: { ...bag.equip!, inventoryCapacity: capacity } });
  return { content: { ...registry, items }, bag: bag.id.slice('item:'.length) };
}

describe('carried cells in the world (Uncapped Storage step 5)', () => {
  it('draws bow ammunition hotbar first, then the backpack by index, from cells past the legacy 20', () => {
    {      const { content, bag } = withBag(400);
      const cells = [cell('equipment', 4, bag), cell('backpack', 300, 'arrow', 7), cell('backpack', 30, 'arrow', 3),
        cell('hotbar', 4, 'arrow', 2), cell('crafting', 1, 'arrow', 9), cell('equipment', 5, 'arrow', 1)];
      const { ctx, api } = fixture(cells, { content });
      expect(api.carriedAmmunitionRows(ctx, sender, 'arrow').map((row: FixtureCellRow) => `${row.container}:${row.index}`))
        .toEqual(['hotbar:4', 'backpack:30', 'backpack:300']);
      // Under a 20-cell bag the same cells are stranded, never renumbered into equipment or crafting.
      const capped = fixture(cells, { content: withBag(20).content });
      expect(capped.api.carriedAmmunitionRows(capped.ctx, sender, 'arrow').map((row: FixtureCellRow) => `${row.container}:${row.index}`))
        .toEqual(['hotbar:4']);
    }
  });

  it('counts expedition readiness from backpack cells at index 30 and 300', () => {
    {
      const { content, bag } = withBag(400);
      const gear = [cell('equipment', 4, bag), cell('equipment', 3, 'hearth_common_bow', 1, 300), cell('equipment', 9, 'hearth_common_body')];
      const ready = (cells: readonly FixtureCellRow[], capacity = 400) => {
        const { ctx, api } = fixture([...gear, ...cells], { content: capacity === 400 ? content : withBag(capacity).content });
        return api.expeditionPreparationFor(ctx, sender);
      };
      expect(ready([cell('backpack', 30, 'arrow', 4), cell('backpack', 300, 'arrow', 6)])).toEqual({ weapon: 1, body: 1 });
      expect(ready([cell('backpack', 30, 'arrow', 4), cell('backpack', 300, 'arrow', 5)])).toEqual({ weapon: 0, body: 1 });
      expect(ready([cell('backpack', 30, 'arrow', 10)], 20)).toEqual({ weapon: 0, body: 1 });
    }
  });

  it('addresses behaviour items by container and index, including a backpack cell past the legacy 20', () => {
    const { ctx, api } = fixture([cell('backpack', 25, 'arrow', 4), cell('equipment', 3, 'hearth_common_sword', 1, 250)]);
    expect(api.behaviourItemSnapshot(ctx, cell('backpack', 25, 'arrow', 4))).toMatchObject({ containerId: 'backpack', slot: 25, count: 4 });
    expect(api.behaviourItemSnapshot(ctx, cell('equipment', 5, 'torch'))).toMatchObject({ containerId: 'equipment', slot: 5 });
    // The Main Hand selection is the equipment cell 3, and a hotbar selection is its hotbar index.
    const mainHand = fixture([cell('equipment', 3, 'hearth_common_sword', 1, 250)], { selectedSlot: sim.MAIN_HAND_SELECTED_SLOT });
    expect(mainHand.api.selectedBehaviourItem(mainHand.ctx).ref).toMatchObject({ containerId: 'equipment', slot: 3, kind: 'hearth_common_sword' });
    const hotbar = fixture([cell('hotbar', 7, 'axe', 1, 100)], { selectedSlot: 7 });
    expect(hotbar.api.selectedBehaviourItem(hotbar.ctx).ref).toMatchObject({ containerId: 'hotbar', slot: 7, kind: 'axe' });
  });

  it('use_selected equipment_use names the equipment cell by index (protocol 3) and refuses older tabs', () => {
    const torch = cell('equipment', 5, 'torch');
    const dispatch = (equipmentIndex: number, protocol = CURRENT_PROTOCOL) => {
      const { ctx, api } = fixture([torch], { protocol });
      const events: sim.EquipmentUseEvent[] = [];
      const useSelectedAuthority = {
        authorize: () => {}, reject: (code: string) => { throw new Error(code); }, actorRef: () => ({ entityType: 'player', id: 'cells-player' }),
        equipmentItem: api.equipmentBehaviourItem,
        handlers: () => sim.registerHandler(sim.createHandlerRegistry(), {
          id: 'torch', eventType: 'equipmentUse', source: 'selectedItem', match: { kind: 'definition', definitionId: 'item:torch' },
          handler: (event: sim.EquipmentUseEvent) => { events.push(event); return sim.effectsResult([]); },
        }),
        snapshot: (_ctx: unknown, _target: unknown, selectedItem: sim.BehaviourItemSnapshot) => sim.createReadOnlySnapshot({
          tick: 1n, registry: { engineVersion: 1, revision: 1n, contentHash: 'hash', definitions: {} },
          space: { id: '0', kind: 'island', tags: [] }, calendar: { minuteOfDay: 0, season: 'spring' }, nearbyObjects: [], selectedItem,
        }),
        apply: () => {},
      } as unknown as UseSelectedAuthority;
      useSelectedBehaviour(ctx as never, { verb: 'equipment_use', targetKind: '', entityId: 0n, tileX: 0, tileY: 0, equipmentIndex }, useSelectedAuthority);
      return events;
    };
    expect(sim.CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION).toBe(3);
    expect(dispatch(5).map(event => [event.equipmentIndex, event.equipmentItem])).toEqual([
      [5, { kind: 'torch', instanceId: torch.id, containerId: 'equipment', slot: 5 }],
    ]);
    // The legacy global slot of the Off Hand (35) is no equipment index, and indices past the ten cells name nothing.
    expect(() => dispatch(35)).toThrow('behaviour_equipment_item_required');
    expect(() => dispatch(10)).toThrow('behaviour_equipment_item_required');
    expect(() => dispatch(4)).toThrow('behaviour_equipment_item_required');
    // A protocol 2 tab (which sent 35 here) gets the UPDATE REQUIRED refusal before any equipment is read.
    expect(() => dispatch(5, 2)).toThrow('inventory_client_update_required');
  });

  it('keeps no legacy global-slot adapter in the world', () => {
    const text = source.getFullText();
    expect(text).not.toMatch(/\blegacySlotRows\b|\blegacySlotOfCell\b|\bcellToLegacyGlobalSlot\b|\bisAccessibleCarriedSlot\b/u);
    expect(text).toContain('equipmentIndex: t.u8(),');
    expect(text).not.toContain('equipmentSlot: t.u8(),');
    expect(readFileSync(new URL('./container-cells.ts', import.meta.url), 'utf8')).not.toContain('legacySlotRows');
  });
});
