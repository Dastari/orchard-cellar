import { describe, expect, it } from 'vitest';
import { createMockAdminObjectsApi } from '../../admin/objects-api.js';
import { NpcManagerModel } from './model.js';

describe('U4 NPC Manager model', () => {
  it('filters to NPCs and relocates position/home through preview then commit', async () => {
    const model = new NpcManagerModel(createMockAdminObjectsApi(), 'owner', () => 'npc-mutation-0001');
    await model.load();
    expect(model.snapshot().rows).toEqual([expect.objectContaining({ entityId: '7', kind: 'npc' })]);
    model.select('7'); model.setReason('Return Fin to authored home');
    await model.previewRelocate('0', 40, 41);
    expect(model.snapshot().pending?.baseVersion).toBe('entity-v1');
    expect((await model.commit()).committed).toBe(true);
    expect(model.snapshot().rows[0]).toMatchObject({ tileX: 40, tileY: 41, version: 'entity-v2' });
  });
});
