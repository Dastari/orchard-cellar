import { afterEach, expect, it } from 'vitest';
import { worldSamplingProbe } from '@orchard/ui';
import { drawSamplingWorldItem, drawSamplingWeatherRange } from './world-sampling-producers.js';
afterEach(() => { worldSamplingProbe.enabled = false; worldSamplingProbe.producer = 'direct-world'; });
it('restores attribution after a failed painter or interleaved weather draw', () => {
  worldSamplingProbe.enabled = true;
  expect(() => drawSamplingWorldItem({ footY: 0, tie: 'terrain-cap:1:2', draw() {
    expect(worldSamplingProbe.producer).toBe('terrain-cap');
    expect(() => drawSamplingWeatherRange(() => {
      expect(worldSamplingProbe.producer).toBe('weather-depth'); throw new Error('weather_failure');
    }, 0, 1)).toThrow('weather_failure');
    expect(worldSamplingProbe.producer).toBe('terrain-cap'); throw new Error('painter_failure');
  } })).toThrow('painter_failure');
  expect(worldSamplingProbe.producer).toBe('direct-world');
});
it('keeps unprepared numeric identities in a bounded explicit group', () => {
  worldSamplingProbe.enabled = true;
  drawSamplingWorldItem({ footY: 0, tie: 19004, draw() { expect(worldSamplingProbe.producer).toBe('legacy-depth-item'); } });
});
