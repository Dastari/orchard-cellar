import { describe, expect, it } from 'vitest';
import { createMockAdminObjectsApi } from '../../admin/objects-api.js';
import { ObjectManagerModel, objectMutationEnabled } from './model.js';

describe('U4 Object Manager model', () => {
  it('pages bounded rows and binds a move preview to exact version/fingerprint commit', async () => {
    const api = createMockAdminObjectsApi();
    const model = new ObjectManagerModel(api, 'admin', () => 'object-mutation-0001');
    await model.load(); model.setReason('Resolve misplaced station');
    expect(model.snapshot().rowsScanned).toBeLessThanOrEqual(50);
    const row = model.snapshot().rows.find(({ entityId }) => entityId === '11')!;
    await model.preview({ operation: 'move_entity', entityId: row.entityId, spaceId: '0', tileX: 30, tileY: 31 });
    expect(model.snapshot().pending[0]).toMatchObject({ baseVersion: row.version, fingerprint: expect.stringMatching(/^preview:/u) });
    const [result] = await model.commit();
    expect(result?.committed).toBe(true);
    expect(model.snapshot().rows.find(({ entityId }) => entityId === '11')).toMatchObject({ tileX: 30, tileY: 31 });
  });

  it('supports bulk selection while only owner/admin can mutate', async () => {
    let id = 0;
    const model = new ObjectManagerModel(createMockAdminObjectsApi(), 'owner', () => `bulk-mutation-${++id}`);
    await model.load(); model.setReason('Repair selected live objects');
    model.toggle('10'); model.toggle('11');
    expect(await model.previewSelected('repair_entity')).toHaveLength(2);
    expect(await model.commit()).toHaveLength(2);
    expect(objectMutationEnabled('support')).toBe(false);
    expect(objectMutationEnabled('content_editor')).toBe(false);
    expect(objectMutationEnabled('admin')).toBe(true);
  });
});
