import { describe, expect, it, vi } from 'vitest';
import { FurnitureMoveController } from './furniture-move-controller.js';
const row = { id: 9n, spaceId: 12, kind: 'furniture_townhouse_table_lamp', tileX: 5, tileY: 4,
  stateJson: '{"lit":true,"hearthFurnitureSupportId":"9007199254740993","hearthFurnitureRevision":"7"}' };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
describe('authoritative furniture move history', () => {
  it('reverses geometry with the new revision and original exact support id', async () => {
    const send = vi.fn(async () => {}), controller = new FurnitureMoveController(send);
    controller.setScope('session:room'); controller.select(row);
    await controller.moveTo(8, 6, 11n);
    expect(send).toHaveBeenLastCalledWith(9n, 8, 6, 7n, 11n);
    expect(controller.selected).toBeNull(); expect(controller.canUndo).toBe(true);
    await controller.undo();
    expect(send).toHaveBeenLastCalledWith(9n, 5, 4, 8n, 9007199254740993n);
    expect(controller.canUndo).toBe(false);
    expect(row.stateJson).toContain('"hearthFurnitureRevision":"7"');
  });
  it('retains selection on rejection and does not manufacture inverse history', async () => {
    const controller = new FurnitureMoveController(async () => { throw new Error('furniture_changed'); });
    controller.select(row);
    await expect(controller.moveTo(8, 6)).rejects.toThrow('furniture_changed');
    expect(controller.pending).toBe(false); expect(controller.canUndo).toBe(false);
    expect(controller.selected).toEqual(row);
  });
  it('releases an unresolved old session without letting its completion unlock a new move', async () => {
    const old = deferred(), next = deferred();
    const send = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const controller = new FurnitureMoveController(send);
    controller.setScope('session1:room'); controller.select(row);
    const oldMove = controller.moveTo(8, 6);
    controller.setScope('session2:room');
    expect(controller.pending).toBe(false); expect(controller.selected).toBeNull();
    controller.select(row); const nextMove = controller.moveTo(9, 6);
    old.resolve(); await oldMove;
    expect(controller.pending).toBe(true); expect(controller.canUndo).toBe(false);
    await expect(controller.undo()).rejects.toThrow('furniture_action_pending');
    next.resolve(); await nextMove;
    expect(controller.pending).toBe(false); expect(controller.canUndo).toBe(true);
    controller.setScope('session2:otherroom'); expect(controller.canUndo).toBe(false);
  });
});
