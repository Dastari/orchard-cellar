import { describe, expect, it } from 'vitest';
import { AvatarAnimationController, LocalActionPresentation, type PresentedActionStamp } from './netcode.js';

const idle = { kind: 'none', startedTick: 99n };
const swing = { kind: 'swing_axe', startedTick: 100n };

function rig(frames = 6, fps = 10) {
  const local = new LocalActionPresentation();
  const avatar = new AvatarAnimationController();
  function draw(nowMs: number, authority: PresentedActionStamp = swing, charging = false) {
    const sample = local.sample(authority, nowMs);
    const frame = avatar.update(0, 0, sample.kind, sample.startedTick,
      100 + nowMs / 50 - 1.5, 6, 8, frames, fps, true, sample.elapsedMs, sample.predictionToken);
    if (!charging && frame.channel === 'locomotion' && sample.predictionToken !== undefined) {
      local.complete(sample.predictionToken);
    }
    return frame;
  }
  return { local, avatar, draw };
}

describe('local predicted action presentation', () => {
  it('does not replay the delayed authority tail after the six-frame local swing ends', () => {
    const { local, draw } = rig();
    local.start('swing_axe', 0, idle);
    expect(draw(500)).toMatchObject({ channel: 'action', frame: 5 });
    expect(draw(600)).toMatchObject({ channel: 'locomotion' });
    // Previously the650ms preview cutoff returned to delayed authority frame5.
    for (const time of [649, 650, 666, 675, 725]) {
      expect(draw(time), `no tail at${time}ms`).toMatchObject({ channel: 'locomotion' });
    }
  });

  it('consumes a corresponding echo arriving only after local completion', () => {
    const { local, draw } = rig();
    local.start('swing_axe', 0, idle);
    expect(draw(600, idle).channel).toBe('locomotion');
    expect(draw(800, { kind: 'swing_axe', startedTick: 115n }).channel).toBe('locomotion');
  });

  it('renders a genuinely new authoritative action after the matched echo', () => {
    const { local, draw, avatar } = rig();
    local.start('swing_axe', 0, idle);
    draw(600);
    const next = local.sample({ kind: 'swing_axe', startedTick: 120n }, 1_000);
    expect(next.predictionToken).toBeUndefined();
    expect(avatar.update(0, 0, next.kind, next.startedTick, 120, 6, 8, 6, 10))
      .toMatchObject({ channel: 'action', frame: 0 });
  });

  it('restarts a new local swing immediately even before the server stamp changes', () => {
    const { local, draw } = rig();
    local.start('swing_axe', 0, idle);
    draw(600);
    local.start('swing_axe', 601, swing);
    expect(draw(601)).toMatchObject({ channel: 'action', frame: 0 });
    expect(draw(701, { kind: 'swing_axe', startedTick: 112n }))
      .toMatchObject({ channel: 'action', frame: 1 });
  });

  it('matches two delayed same-kind echoes in order without replaying the newer completed swing', () => {
    const { local, draw, avatar } = rig();
    const baseline = { kind: 'none', startedTick: 100n };
    local.start('swing_axe', 0, baseline);
    local.start('swing_axe', 200, baseline);
    expect(draw(300, { kind: 'swing_axe', startedTick: 101n }))
      .toMatchObject({ channel: 'action', frame: 1 });
    expect(draw(800, { kind: 'swing_axe', startedTick: 101n }).channel).toBe('locomotion');
    expect(draw(850, { kind: 'swing_axe', startedTick: 102n }).channel).toBe('locomotion');
    const genuinelyNew = local.sample({ kind: 'swing_axe', startedTick: 103n }, 900);
    expect(genuinelyNew.predictionToken).toBeUndefined();
    expect(avatar.update(0, 0, genuinelyNew.kind, genuinelyNew.startedTick, 103, 6, 8, 6, 10))
      .toMatchObject({ channel: 'action', frame: 0 });
  });

  it('removes a rejected earlier request without consuming the newer request echo', () => {
    const { local, draw } = rig();
    const first = local.start('swing_axe', 0, idle);
    local.start('swing_axe', 200, idle);
    local.reject(first);
    expect(draw(300, swing)).toMatchObject({ channel: 'action', frame: 1 });
    expect(draw(800, swing).channel).toBe('locomotion');
    expect(local.sample({ kind: 'swing_axe', startedTick: 101n }, 850).predictionToken).toBeUndefined();
  });

  it('lets a different newer authoritative action replace the prediction', () => {
    const { local } = rig();
    local.start('swing_axe', 0, idle);
    expect(local.sample({ kind: 'fish_reel', startedTick: 101n }, 50))
      .toEqual({ kind: 'fish_reel', startedTick: 101n });
    // A superseded prediction must not steal a later unpredicted same-kind action.
    expect(local.sample({ kind: 'swing_axe', startedTick: 102n }, 100))
      .toEqual({ kind: 'swing_axe', startedTick: 102n });
  });

  it.each([[4, 20, 200], [12, 8, 1_500]])('uses authored %i frames at%i fps rather than a fixed preview timeout', (frames, fps, duration) => {
    const { local, draw } = rig(frames, fps);
    local.start('swing_axe', 0, idle);
    expect(draw(duration - 1).channel).toBe('action');
    expect(draw(duration).channel).toBe('locomotion');
    expect(draw(duration + 1).channel).toBe('locomotion');
  });

  it('preserves long fishing cast timing and authoritative cancellation', () => {
    const { local, draw } = rig(40, 10);
    local.start('fish_cast', 0, idle);
    const cast = { kind: 'fish_cast', startedTick: 100n };
    expect(draw(700, cast)).toMatchObject({ channel: 'action', frame: 7 });
    expect(draw(750, { kind: 'none', startedTick: 115n }).channel).toBe('locomotion');
  });

  it('preserves held bow and release timing with a fresh presentation token', () => {
    const { local, draw } = rig();
    const bow = { kind: 'ranged_weapon', startedTick: 100n };
    local.start('ranged_weapon', 0, idle);
    draw(1_000, bow, true); // The held-frame override owns charging presentation.
    local.start('ranged_weapon', 1_000 - 450, bow);
    expect(draw(1_000, bow)).toMatchObject({ channel: 'action', frame: 4 });
    expect(draw(1_150, { ...bow, startedTick: 120n }).channel).toBe('locomotion');
  });

  it('does not consume a release echo for a cosmetic-only held bow preview', () => {
    const { local, draw } = rig();
    local.start('ranged_weapon', 0, idle, false);
    draw(1_000, idle, true);
    local.start('ranged_weapon', 550, idle);
    expect(draw(1_000, idle)).toMatchObject({ channel: 'action', frame: 4 });
    expect(draw(1_150, { kind: 'ranged_weapon', startedTick: 120n }).channel).toBe('locomotion');
    expect(local.sample({ kind: 'ranged_weapon', startedTick: 121n }, 1_200).predictionToken).toBeUndefined();
  });

  it('clears old completion on reconnect and never masks an unpredicted action', () => {
    const { local, draw } = rig();
    local.start('swing_axe', 0, idle);
    draw(600);
    local.reset();
    expect(local.sample(swing, 650)).toEqual(swing);
  });

  it('keeps an authoritative one-shot complete across a small clock rewind but permits a new stamp', () => {
    const avatar = new AvatarAnimationController();
    expect(avatar.update(0, 0, 'swing_axe', 100n, 112, 6, 8, 6, 10).channel).toBe('locomotion');
    expect(avatar.update(0, 0, 'swing_axe', 100n, 111.5, 6, 8, 6, 10).channel).toBe('locomotion');
    expect(avatar.update(0, 0, 'swing_axe', 113n, 113, 6, 8, 6, 10))
      .toMatchObject({ channel: 'action', frame: 0 });
    expect(avatar.update(0, 0, 'fishing_wait', 113n, 300, 6, 8, 6, 10).channel).toBe('action');
  });
});
