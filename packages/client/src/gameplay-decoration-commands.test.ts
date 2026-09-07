import { describe, expect, it, vi } from 'vitest';
import { beginDecorationCommands, releaseDecorationCommands } from './gameplay-decoration-commands.js';
import type { GameplayDecorationInputs } from './gameplay-painter-decorations.js';
import type { RuntimeSurvivalDecoration } from './gameplay-painter-inputs.js';

const draw = vi.hoisted(() => vi.fn());
vi.mock('@orchard/engine/overworld-art', () => ({
  drawOverworldPoiDecoration: draw,
  natureDecorationFrame: (_kind: string, tick: number) => tick,
  overworldPoiDecorationDepthY: (_kind: string, y: number) => y,
  pondShimmerFrameAtTick: (tick: number) => tick + 1,
}));
function input(context: CanvasRenderingContext2D, tick: number): GameplayDecorationInputs {
  return { context, art: { cohort: tick }, cameraX: tick, cameraY: tick + 1, scale: 1,
    visualTickClock: { renderTick: tick }, renderWeather: { wind: 1 }, frameLightingModel: 'unified',
  } as unknown as GameplayDecorationInputs;
}
const decoration: RuntimeSurvivalDecoration = { id: 21, kind: 'camp_pond', tileX: 4, tileY: 7, variant: 2, animationOffset: 0 };

describe('retained decoration commands', () => {
  it('reuses the command and callbacks while drawing current art, camera, animation and light state', () => {
    const context = {} as CanvasRenderingContext2D, source = [decoration];
    const commands = beginDecorationCommands(context, source, null);
    const first = commands.get(input(context, 1), decoration, true), callback = first.draw;
    commands.finish();
    for (let frame = 2; frame <= 601; frame++) {
      const current = beginDecorationCommands(context, source, null);
      const command = current.get(input(context, frame), decoration, false);
      expect(command).toBe(first); expect(command.draw).toBe(callback);
      command.draw(); current.finish();
    }
    expect(draw).toHaveBeenLastCalledWith(context, { cohort: 601 }, 'camp_pond', 72, 128, 601, 602, 1, 2, 601, false, 602);
    expect(first.tie).toBe('decoration:21'); expect(first.footY).toBe(128);
    expect(commands.entries.size).toBe(1);
    releaseDecorationCommands(context);
    expect(beginDecorationCommands(context, source, null)).not.toBe(commands);
  });
  it('retires culled entities without mutating a queued command and replaces changed immutable cohorts', () => {
    const context = {} as CanvasRenderingContext2D, source = [decoration];
    const commands = beginDecorationCommands(context, source, null);
    const command = commands.get(input(context, 1), decoration, true); commands.finish();
    for (let frame = 0; frame < 3; frame++) { commands.begin(); commands.finish(); }
    expect(commands.entries.size).toBe(0); expect(command.tie).toBe('decoration:21');
    expect(beginDecorationCommands(context, [...source], null)).not.toBe(commands);
  });
});
