import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('shared hotbar layout authority', () => {
  it('validates selection against the shared capacity, including index 9', () => {
    const reducer = sourceBetween('export const selectHotbar =', 'function repairSelectedToolAtAnvil(');
    expect(reducer).toContain("if (!isHotbarSlot(slot)) throw new SenderError('invalid_hotbar_slot')");
    expect(reducer).not.toContain('HOTBAR_SLOTS.length');
  });

  it('derives container offsets and new-player row count from the sim contract', () => {
    expect(source).toContain('return inventoryContainerSlotOffset(containerId)');
    expect(source).toContain('return inventoryContainerSlotCount(containerId)');
    expect(source).toContain('slot < INVENTORY_SLOT_COUNT');
    expect(source).not.toContain('const BACKPACK_SLOT_OFFSET =');
  });

  it('retains the historical nine-slot boundary only as versioned migration data', () => {
    const migration = sourceBetween(
      'const inventoryMigration = ctx.db.inventory_migration.identity.find(ctx.sender);',
      '// Existing characters receive the ranged starter kit',
    );
    expect(source).toContain('const HOTBAR_LAYOUT_SLOT_COUNTS = [9, HOTBAR_SLOT_COUNT] as const');
    expect(migration).toContain('hotbarSlotCountForLayoutVersion(storedHotbarLayoutVersion)');
    expect(migration).toContain('row.slot >= previousHotbarSlotCount');
    expect(migration).toContain('row.slot + addedHotbarSlots');
    expect(migration).not.toMatch(/row\.slot\s*>?=\s*9/);
  });
});
