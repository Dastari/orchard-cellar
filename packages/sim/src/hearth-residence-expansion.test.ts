import {PLAYER_HITBOX_FOOT_OFFSET} from './movement.js';
import {describe, expect, it} from 'vitest';
import {hearthResidenceExpansionFailure} from './hearth-residence-expansion.js';
import {type HearthFurniturePlacement} from './hearth-furniture-placement.js';
import {HEARTH_FURNITURE_SHAPES} from './hearth-furniture-state.js';
import {residencePlayableTile} from './spaces.js';
import {FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED} from './state.js';
function layout(rank: number, existing: HearthFurniturePlacement[] = []) {
  return {canBuild: true, collision: {width: 32, height: 32,
    blocked: Array.from({length: 1024}, (_, i) => !residencePlayableTile(i % 32, Math.floor(i / 32), rank))},
  existing, occupants: [{x: 8.5 * TILE_SIZE_FIXED, y: 11.5 * TILE_SIZE_FIXED}]};
}
function piece(id: string, kind: string, tileX: number, tileY: number, supportId?: string): HearthFurniturePlacement {
  return {id, shape: HEARTH_FURNITURE_SHAPES[kind]!, tileX, tileY, ...(supportId === undefined ? {} : {supportId})};
}
describe('residence expansion preflight', () => {
  it('preserves table and attachment records through both upgrades', () => {
    const items = [piece('table', 'furniture_rustic_dining_table', 6, 7),
      piece('lamp', 'furniture_townhouse_table_lamp', 6, 6, 'table')];
    const before = JSON.stringify(items);
    expect(hearthResidenceExpansionFailure(0, 1, layout(1, items))).toBeNull();
    expect(hearthResidenceExpansionFailure(1, 2, layout(2, items))).toBeNull();
    expect(JSON.stringify(items)).toBe(before);
  });
  it('allows existing furniture in the east room during the second expansion', () => {
    expect(hearthResidenceExpansionFailure(1,2,layout(2,[piece('chair','furniture_rustic_chair',20,7)]))).toBeNull();
  });
  it('validates an offline seated guest without moving the actor or changing custody', () => {
    const seat = piece('guest-chair', 'furniture_rustic_chair', 6, 7);
    const seated = [{seatId: seat.id, position: {x: 6.5 * TILE_SIZE_FIXED,
      y: 128 * FIXED_UNITS_PER_PIXEL + PLAYER_HITBOX_FOOT_OFFSET}}];
    const before = JSON.stringify(seated);
    expect(hearthResidenceExpansionFailure(0,1,layout(1,[seat]),seated)).toBeNull();
    expect(JSON.stringify(seated)).toBe(before);
    expect(hearthResidenceExpansionFailure(0,1,layout(1),seated)).toBe('invalid_seat_custody');
    expect(hearthResidenceExpansionFailure(0,1,layout(1,[seat]),[...seated,...seated])).toBe('invalid_seat_custody');
  });
  it('rejects an existing piece in a newly opened doorway without relocating it', () => {
    const chair = piece('chair', 'furniture_rustic_chair', 12, 9);
    expect(hearthResidenceExpansionFailure(0, 1, layout(1, [chair]))).toBe('reserved_approach');
    expect(chair.tileX).toBe(12);
  });
  it('rejects wall attachments in a new passage or on proposed floor', () => {
    const mirror = piece('mirror', 'furniture_townhouse_wall_mirror', 21, 15);
    expect(hearthResidenceExpansionFailure(1, 2, layout(2, [mirror]))).toBe('reserved_approach');
    const unsupported = piece('mirror', 'furniture_townhouse_wall_mirror', 18, 17);
    expect(hearthResidenceExpansionFailure(1, 2, layout(2, [unsupported]))).toBe('wall_required');
  });
  it('requires physical access to the new rooms even when they are empty', () => {
    const next = layout(1);
    for (let y = 8; y <= 10; y++) next.collision.blocked[y * 32 + 14] = true;
    expect(hearthResidenceExpansionFailure(0, 1, next)).toBe('escape_blocked');
  });
  it('rejects invalid ranks, missing envelope and unauthorized builders', () => {
    for (const [current, next] of [[0,2],[1,1],[2,3],[-1,0],[NaN,1]]) {
      expect(hearthResidenceExpansionFailure(current!, next!, layout(2))).toBe('invalid_expansion_rank');
    }
    expect(hearthResidenceExpansionFailure(0,1,{...layout(1), canBuild:false})).toBe('builder_required');
    expect(hearthResidenceExpansionFailure(0,1,{...layout(1),collision:{width:16,height:16,blocked:[]}})).toBe('invalid_expansion_layout');
  });
  it('rejects orphaned attachments and an occupant trapped by the proposed layout', () => {
    expect(hearthResidenceExpansionFailure(0,1,layout(1,[piece('lamp','furniture_townhouse_table_lamp',6,6,'missing')]))).toBe('tabletop_support_required');
    const next = layout(1);
    next.occupants = [{x: 1.5*TILE_SIZE_FIXED,y: 1.5*TILE_SIZE_FIXED}];
    expect(hearthResidenceExpansionFailure(0,1,next)).toBe('occupant_blocked');
  });
});
