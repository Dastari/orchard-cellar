import { describe, expect, it } from 'vitest';
import { BOW_LOCOMOTION_SPLIT_ROW, MOUNTED_ACTION_Y_OFFSET, actionToolFlipsForDirection, axeAnimationForDirection, avatarAnimationForDirection, bowLocomotionBobOffset, capybaraVisualAtFrame, heldLightAnimationForDirection, horseFlipsForDirection, horseFrameForDirection, horseJumpPose, idleAvatarAnimationForDirection, isOverworldRoad, natureDecorationFrame, overworldItemIconKey, sortWorldDrawItems, wildlifeAnimationName, wildlifeFlipsForDirection } from './overworld-art.js';
import { canonicalBlob47Index } from './render/tilemap.js';

describe('overworld art topology', () => {
  it('uses the generated atlas canonical blob ordering', () => {
    expect(canonicalBlob47Index(0, 0)).toBe(0);
    expect(canonicalBlob47Index(3, 1)).toBe(4);
    expect(canonicalBlob47Index(15, 15)).toBe(46);
  });

  it('lays two-tile roads between sixteen-tile parcels without a left-edge stripe', () => {
    expect(isOverworldRoad(0, 8)).toBe(false);
    expect(isOverworldRoad(15, 8)).toBe(true);
    expect(isOverworldRoad(16, 8)).toBe(true);
    expect(isOverworldRoad(17, 8)).toBe(false);
    expect(isOverworldRoad(8, 15)).toBe(true);
  });

  it('uses the side pose for diagonal travel when the licensed sheet has cardinal poses only', () => {
    expect(avatarAnimationForDirection('up')).toBe('walk_up');
    expect(avatarAnimationForDirection('upLeft')).toBe('walk_right');
    expect(avatarAnimationForDirection('upRight')).toBe('walk_right');
    expect(avatarAnimationForDirection('down')).toBe('walk_down');
    expect(idleAvatarAnimationForDirection('down')).toBe('idle_down');
    expect(idleAvatarAnimationForDirection('left')).toBe('idle_right');
    expect(idleAvatarAnimationForDirection('up')).toBe('idle_up');
  });

  it('uses the authored hold pose for portable lights', () => {
    expect(heldLightAnimationForDirection('down', false)).toBe('hold_idle_down');
    expect(heldLightAnimationForDirection('right', true)).toBe('hold_walk_right');
    expect(heldLightAnimationForDirection('left', true)).toBe('hold_walk_right');
    expect(heldLightAnimationForDirection('up', false)).toBe('hold_idle_up');
  });

  it('uses the licensed directional axe rows and mirrors side swings', () => {
    expect(axeAnimationForDirection('up')).toBe('axe_up');
    expect(axeAnimationForDirection('down')).toBe('axe_down');
    expect(axeAnimationForDirection('left')).toBe('axe_right');
    expect(axeAnimationForDirection('upRight')).toBe('axe_right');
    expect(actionToolFlipsForDirection('up')).toBe(false);
    expect(actionToolFlipsForDirection('down')).toBe(false);
    expect(actionToolFlipsForDirection('right')).toBe(false);
    expect(actionToolFlipsForDirection('upRight')).toBe(false);
    expect(actionToolFlipsForDirection('left')).toBe(true);
    expect(actionToolFlipsForDirection('downLeft')).toBe(true);
  });

  it('maps the horse and mounted sheets using their distinct direction row order', () => {
    expect(horseFrameForDirection('right', false, 0, false)).toBe(0);
    expect(horseFrameForDirection('down', false, 0, false)).toBe(2);
    expect(horseFrameForDirection('up', true, 5, false)).toBe(23);
    expect(horseFrameForDirection('down', false, 0, true)).toBe(0);
    expect(horseFrameForDirection('right', true, 5, true)).toBe(17);
    expect(horseFrameForDirection('up', true, 5, true)).toBe(23);
  });

  it('mirrors standalone and mounted horses from their opposite source orientations', () => {
    expect(horseFlipsForDirection('left', false)).toBe(false);
    expect(horseFlipsForDirection('right', false)).toBe(true);
    expect(horseFlipsForDirection('left', true)).toBe(true);
    expect(horseFlipsForDirection('right', true)).toBe(false);
  });

  it('selects authored locomotion, forage, sleep, and aquatic animation rows', () => {
    expect(wildlifeAnimationName('cow', 'up', true, 'up')).toBe('walk_up');
    expect(wildlifeAnimationName('pig', 'left', false, 'sleep')).toBe('sleep_side');
    expect(wildlifeAnimationName('chicken', 'right', false, 'graze')).toBe('forage_side');
    expect(wildlifeAnimationName('duck', 'left', true, 'left')).toBe('swim_side');
    expect(wildlifeAnimationName('frog', 'down', true, 'down')).toBe('hop_side');
    expect(wildlifeAnimationName('bee', 'up', true, 'up')).toBe('fly_side');
    expect(wildlifeAnimationName('vulture', 'left', false, 'sleep')).toBe('sleep_side');
    expect(wildlifeAnimationName('butterfly', 'left', false, 'rest')).toBe('flutter');
    expect(wildlifeAnimationName('vulture', 'up', true, 'up')).toBe('fly_up');
    expect(wildlifeAnimationName('cow', 'right', false, 'rest')).toBe('rest_side');
  });

  it('mirrors right-authored vulture flight independently from other animals', () => {
    expect(wildlifeFlipsForDirection('vulture', 'left')).toBe(true);
    expect(wildlifeFlipsForDirection('vulture', 'right')).toBe(false);
    expect(wildlifeFlipsForDirection('cow', 'left')).toBe(false);
    expect(wildlifeFlipsForDirection('cow', 'right')).toBe(true);
  });

  it('cycles capybaras through authored dive, bubbles, and emerge strips only in water', () => {
    expect(capybaraVisualAtFrame(50, true)).toBe('look');
    expect(capybaraVisualAtFrame(70, true)).toBe('dive');
    expect(capybaraVisualAtFrame(90, true)).toBe('bubbles');
    expect(capybaraVisualAtFrame(120, true)).toBe('emerge');
    expect(['idle', 'look']).toContain(capybaraVisualAtFrame(90, false));
  });

  it('aligns action-sheet riders with the authored mounted seat', () => {
    expect(MOUNTED_ACTION_Y_OFFSET).toBe(-10);
  });

  it('matches the walking body bob while compositing a bow upper body', () => {
    expect(BOW_LOCOMOTION_SPLIT_ROW).toBe(28);
    expect([0, 1, 2, 3, 4, 5].map(bowLocomotionBobOffset)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('reconstructs a deterministic mounted jump arc from authority timing', () => {
    expect(horseJumpPose(0, 0, 1_024, 0, 20n, 10)).toMatchObject({ x: 0, y: 0, footY: 0, progress: 0 });
    const middle = horseJumpPose(0, 0, 1_024, 0, 20n, 15);
    expect(middle?.x).toBe(512);
    expect(middle?.footY).toBe(0);
    expect(middle?.y).toBeLessThan(0);
    expect(horseJumpPose(0, 0, 1_024, 0, 20n, 20)).toMatchObject({ x: 1_024, y: 0, progress: 1 });
    expect(horseJumpPose(undefined, 0, 1_024, 0, 20n, 15)).toBeNull();
    expect(horseJumpPose(0, 0, 1_024, 0, 20n, 21)).toBeNull();
  });

  it('sorts world objects by foot point with a deterministic tie-break', () => {
    expect(sortWorldDrawItems([
      { footY: 32, tie: 'player' },
      { footY: 16, tie: 'tree' },
      { footY: 32, tie: 'apple' },
    ]).map((item) => item.tie)).toEqual(['tree', 'apple', 'player']);
  });

  it('renders ground drops using their actual inventory item art', () => {
    expect(overworldItemIconKey('axe')).toBe('icon_cf_axe');
    expect(overworldItemIconKey('workbench')).toBe('prop_cf_workbench');
    expect(overworldItemIconKey('fiber')).toBe('icon_cf_fiber');
    expect(overworldItemIconKey('future_item')).toBe('system_missing_asset');
  });

  it('rests vegetation in calm weather while fish and water continue moving', () => {
    expect(natureDecorationFrame('nature_grass', 25, 10, 0.29)).toBe(0);
    expect(natureDecorationFrame('nature_flower', 25, 10, 0.3)).toBe(7);
    expect(natureDecorationFrame('nature_lily_pad', 25, 10, 1)).toBe(7);
    expect(natureDecorationFrame('nature_fish_shadow', 25, 10, 0)).toBe(7);
    expect(natureDecorationFrame('nature_water_rock', 25, 10, 0)).toBe(7);
  });
});
