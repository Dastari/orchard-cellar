import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellsIsolated, occupiedCell, type SmokeCell } from './auth-world-smoke.js';

const source = readFileSync(new URL('./auth-world-smoke.ts', import.meta.url), 'utf8');
const who = (hex: string) => ({ hex, isEqual: (other: unknown) => (other as { hex?: string }).hex === hex });
const alice = who('a1');
const bob = who('b2');
const cell = (owner: ReturnType<typeof who>, container: string, index: number, itemKind = 'axe', quantity = 1): SmokeCell => ({
  identity: owner, container, index, itemKind, quantity,
});

describe('auth world smoke on container cells', () => {
  it('reads sparse cells: an empty cell is a missing row, never a row per slot', () => {
    const rows = [cell(alice, 'backpack', 0, 'wood', 4), cell(alice, 'hotbar', 0), cell(alice, 'hotbar', 3, 'torch', 2)];
    expect(occupiedCell(rows, 'hotbar', 0)?.itemKind).toBe('axe');
    // Container-scoped: backpack 0 is not hotbar 0, and an index with no row is empty.
    expect(occupiedCell([rows[0]!], 'hotbar', 0)).toBeNull();
    expect(occupiedCell(rows, 'hotbar', 1)).toBeNull();
    expect(occupiedCell([], 'hotbar', 0)).toBeNull();
    // A vacant row (never stored by the world) still reads as empty.
    expect(occupiedCell([cell(alice, 'hotbar', 0, 'empty', 0)], 'hotbar', 0)).toBeNull();
  });

  it('detects another identity in the caller-scoped view', () => {
    expect(cellsIsolated([cell(alice, 'hotbar', 0), cell(alice, 'stash', 5)], alice as never)).toBe(true);
    expect(cellsIsolated([], alice as never)).toBe(true);
    expect(cellsIsolated([cell(alice, 'hotbar', 0), cell(bob, 'hotbar', 0)], alice as never)).toBe(false);
  });

  it('loads without connecting', async () => {
    await expect(import('./auth-world-smoke.js')).resolves.toMatchObject({ main: expect.any(Function) });
    expect(source).toContain('import.meta.url === pathToFileURL(process.argv[1]).href) await main()');
  });

  it('reads the container-cell view only, after acknowledging inventory protocol 2', () => {
    expect(source).toContain('tables.ownPlayerContainerCells');
    // The frozen legacy slot views are never read.
    expect(source).not.toMatch(/ownInventorySlots|ownHearthStashSlots|\.slot\b/u);
    expect(source).toContain('version: CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION');
    const main = source.slice(source.indexOf('export async function main'));
    expect(main.indexOf('acknowledgeProtocol(alice)')).toBeGreaterThan(0);
    expect(main.indexOf('acknowledgeProtocol(alice)')).toBeLessThan(main.indexOf('subscribe(alice)'));
    expect(main.indexOf('acknowledgeProtocol(alice)')).toBeLessThan(main.indexOf('reducers.dropSelected'));
    for (const tab of ['secondTab', 'reconnect']) {
      expect(main.indexOf(`acknowledgeProtocol(${tab})`)).toBeLessThan(main.indexOf(`subscribe(${tab})`));
    }
    // An older world is refused with a plain message instead of being read through frozen views.
    expect(source).toContain('auth_smoke_world_not_on_container_cells');
    expect(source).toContain('subscription_rejected:${SMOKE_PROTOCOL_REQUIRED}');
    // The raw cell table stays private.
    expect(main).toContain("privateTableRejected(bob, 'player_container_cell')");
  });
});
