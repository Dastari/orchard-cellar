import { afterEach, describe, expect, it } from 'vitest';
import { countWorldSampling, registerWorldSamplingContext, unregisterWorldSamplingContext,
  resetWorldSamplingCounters, setWorldSamplingProducer, worldSamplingProbe } from './world-sampling-counters.js';
const world = {}, hud = {}, construction = {};
afterEach(() => { worldSamplingProbe.enabled = false; worldSamplingProbe.producers.clear(); worldSamplingProbe.overflow = false; worldSamplingProbe.producer = 'direct-world'; unregisterWorldSamplingContext(world); });
function draw(context = world, width = 16, a = 1, b = 0, c = 0, d = 1, smooth = false): void {
  countWorldSampling(context, 16, 16, width, 16, a, b, c, d, smooth);
}
function begin(): void { registerWorldSamplingContext(world); worldSamplingProbe.enabled = true; }
describe('world submission sampling', () => {
  it('excludes HUD, construction, disposed contexts and the disabled probe', () => {
    registerWorldSamplingContext(world); draw(); expect(worldSamplingProbe.producers.size).toBe(0);
    begin(); draw(hud); draw(construction); unregisterWorldSamplingContext(world); draw();
    expect(worldSamplingProbe.producers.size).toBe(0);
  });
  it('counts enlargement, reduction, noninteger ratios, flips and quarter turns independently of smoothing', () => {
    begin(); draw(); draw(world, 32); draw(world, 8); draw(world, 24);
    draw(world, 16, -2); draw(world, 16, 0, 2, -2, 0);
    draw(world, 24, 1, 0, 0, 1, true);
    expect(worldSamplingProbe.producers.get('direct-world')).toEqual({ draws: 7, nonInteger: 2, nearestNonInteger: 1, smoothed: 1, nonAxisAligned: 0 });
  });
  it('records arbitrary rotations separately from extent ratios', () => {
    begin(); draw(world, 16, Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2);
    expect(worldSamplingProbe.producers.get('direct-world')).toMatchObject({ draws: 1, nonInteger: 0, nonAxisAligned: 1 });
  });
  it('preserves producer attribution through nested scopes and frame reset', () => {
    begin(); const outer = setWorldSamplingProducer('cliff'); draw();
    const inner = setWorldSamplingProducer('weather-depth'); draw(world, 24);
    setWorldSamplingProducer(inner); draw(); setWorldSamplingProducer(outer);
    expect(worldSamplingProbe.producers.get('cliff')?.draws).toBe(2);
    expect(worldSamplingProbe.producers.get('weather-depth')?.nonInteger).toBe(1);
    const retained = worldSamplingProbe.producers.get('cliff'); resetWorldSamplingCounters();
    expect(worldSamplingProbe.producers.get('cliff')).toBe(retained);
    expect(retained?.draws).toBe(0);
  });
  it('marks overflow instead of silently claiming a complete report', () => {
    begin(); for (let i = 0; i < 65; i++) { setWorldSamplingProducer(String(i)); draw(); }
    expect(worldSamplingProbe.producers.size).toBe(64); expect(worldSamplingProbe.overflow).toBe(true);
  });
});
