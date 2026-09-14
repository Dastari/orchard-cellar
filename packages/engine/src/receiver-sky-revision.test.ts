import { expect, it } from 'vitest';
import { CelestialReceiverScene } from './receiver-lighting.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';

it('distinguishes RGB steps from geometry, caster movement and initial preparation', () => {
  const scene = new CelestialReceiverScene(4);
  const sky = celestialLightingAtCalendar({ continuousDay: 30, clockHours: 12, lunarProgress: 0.5, lunarIllumination: 1 });
  scene.prepareSplit(sky, [], [], 1);
  const initial = scene.diagnostics.skyRgbRevision;
  expect(initial).toBe(1);
  scene.prepareSplit({ ...sky, sun: { ...sky.sun, direction: [0, 0, 1] } }, [], [], 2);
  expect(scene.diagnostics.skyRgbRevision).toBe(initial);
  scene.prepareSplit({ ...sky, diffuse: { ...sky.diffuse, r: sky.diffuse.r - 1 } }, [], [], 2);
  expect(scene.diagnostics.skyRgbRevision).toBe(initial + 1);
  scene.reset(); expect(scene.diagnostics.skyRgbRevision).toBe(0);
});
