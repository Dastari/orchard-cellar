import { describe, expect, it } from 'vitest';
import { createMockAdminObjectsApi } from '../../admin/objects-api.js';
import { ContainerManagerModel } from './model.js';

describe('U4 Container Inspector model', () => {
  it('shows slots and processor custody and commits an exact slot preview', async () => {
    const model = new ContainerManagerModel(createMockAdminObjectsApi(), 'admin', () => 'container-mutation-01');
    await model.inspect('11');
    expect(model.snapshot().container).toMatchObject({
      processor: { processStartTick: '900', processInputKind: 'iron_ore' },
      slots: [{ itemKind: 'iron_ore', quantity: 2 }, null],
    });
    model.setReason('Restore processor output slot');
    await model.preview({ operation: 'set_container_slot', slot: 1, stack: { itemKind: 'iron_ingot', quantity: 1 } });
    const result = await model.commit();
    expect(result.committed).toBe(true);
    expect(model.snapshot().container?.slots[1]).toMatchObject({ itemKind: 'iron_ingot', quantity: 1 });
    expect(model.snapshot().container?.processor).toMatchObject({ processStartTick: '900' });
  });

  it('keeps support read-only', async () => {
    const model = new ContainerManagerModel(createMockAdminObjectsApi(), 'support', () => 'container-mutation-02');
    await model.inspect('10'); model.setReason('Attempt forbidden object edit');
    await expect(model.preview({ operation: 'repair_entity' })).rejects.toThrow('admin_role_forbidden');
  });
});
