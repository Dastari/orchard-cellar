import { describe, expect, it } from 'vitest';
import type { TerrainArray } from '@orchard/engine/terrain';
import { RetainedFrameCommands } from './retained-frame-commands.js';

const terrain = () => ({ version: 1 }) as TerrainArray;
function insert(pool: RetainedFrameCommands, id: bigint, value: number, drawn: number[]) {
  const state = { value };
  return pool.insert(0, id, state, { tie: `player:${id}`, footY: value, draw: () => drawn.push(state.value) });
}
describe('retained entity command ownership', () => {
  it('keeps commands and callbacks stable across 600 moving frames and draws current state', () => {
    const pool = new RetainedFrameCommands(), world = terrain(), drawn: number[] = [];
    pool.begin(world); const first = insert(pool, 7n, 0, drawn); pool.finish();
    for (let frame = 1; frame <= 600; frame++) {
      pool.begin(world);
      const command = pool.find<{ value: number }>(0, 7n)!;
      expect(command).toBe(first); expect(command.item.draw).toBe(first.item.draw);
      command.state.value = frame / 4; command.item.footY = frame / 4;
      command.item.draw(); pool.finish();
    }
    expect(drawn).toEqual(Array.from({ length: 600 }, (_, frame) => (frame + 1) / 4));
    expect(pool.diagnostics).toEqual({ builds: 1, reuses: 600, retired: 0 });
  });
  it('isolates duplicate submissions, slot schemas and number/bigint identities', () => {
    const pool = new RetainedFrameCommands(), drawn: number[] = [];
    pool.begin(terrain());
    const first = insert(pool, 7n, 1, drawn);
    expect(pool.find(0, 7n)).toBeUndefined();
    const duplicate = insert(pool, 7n, 2, drawn);
    const alternate = pool.insert('door', 7, { text: 'door' }, { tie: 'door', footY: 0, draw: () => drawn.push(3) });
    first.item.draw(); duplicate.item.draw(); alternate.item.draw();
    expect(drawn).toEqual([1, 2, 3]); expect(first.state.value).toBe(1);
    pool.finish();
  });
  it('retires invisible commands and bounds ownership without invalidating queued callbacks', () => {
    const pool = new RetainedFrameCommands(2), world = terrain(), drawn: number[] = [];
    pool.begin(world);
    const first = insert(pool, 1n, 1, drawn); insert(pool, 2n, 2, drawn); insert(pool, 3n, 3, drawn);
    pool.finish(); expect(pool.diagnostics.retired).toBe(1);
    for (let frame = 0; frame < 3; frame++) { pool.begin(world); pool.finish(); }
    expect(pool.diagnostics.retired).toBe(3);
    first.item.draw(); expect(drawn).toEqual([1]);
    pool.begin(world); expect(pool.find(0, 3n)).toBeUndefined();
  });
  it('invalidates on terrain revision or replacement and explicitly clears retained state', () => {
    const pool = new RetainedFrameCommands(), first = terrain(), drawn: number[] = [];
    pool.begin(first); insert(pool, 1n, 1, drawn); pool.finish();
    Object.assign(first, { version: 2 }); pool.begin(first); expect(pool.find(0, 1n)).toBeUndefined();
    insert(pool, 1n, 2, drawn); pool.finish();
    pool.begin(terrain()); expect(pool.find(0, 1n)).toBeUndefined();
    insert(pool, 1n, 3, drawn); pool.clear(); expect(pool.diagnostics.retired).toBe(3);
    expect(() => new RetainedFrameCommands(0)).toThrow(RangeError);
  });
});
