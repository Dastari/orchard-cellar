import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { projectDirectionalCaster } from './directional-shadows.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';

// Frozen from the deployed0.6.0 projector: bounds, coverage and sampling integrals.
it('preserves all320 shadow mask golden cases across directions and receiver heights', () => {
  const body = { width: 12, height: 24, anchorX: 6, anchorY: 23,
    opaque: Uint8Array.from({ length: 12 * 24 }, (_, i) => (i % 12 * 3 + Math.floor(i / 12) * 5) % 7 === 0 ? 0 : 1) };
  const base = { owner: 'probe', worldX: 40, worldY: 60, baseHeightSubunits: 0, heightSubunits: 8,
    footprint: { left: -4, top: -3, right: 4, bottom: 3 }, contact: true };
  const digest = createHash('sha256'); let cases = 0;
  for (const silhouette of [undefined, body]) for (const baseHeightSubunits of [0, 8])
    for (const height of [-8, 0, 4, 8]) for (const hour of [0, 4, 6, 7, 9, 12, 15, 17, 18, 20]) {
      const caster = silhouette === undefined ? { ...base, baseHeightSubunits } : { ...base, baseHeightSubunits, silhouette };
      const sky = celestialLightingAtCalendar({ continuousDay: 10.5, clockHours: hour, lunarProgress: .5, lunarIllumination: 1 });
      for (const source of [sky.sun, sky.moon]) {
        const a = projectDirectionalCaster(caster, source, height, 4); cases++;
        if (a === null) { digest.update('null'); continue; }
        const metadata = (v: typeof a) => JSON.stringify([v.left, v.top, v.width, v.height]);
        digest.update(metadata(a));
        for (const field of ['coverage', 'integral'] as const) {
          const aa = Buffer.from(a[field].buffer);
          digest.update(aa);
        }
      }
    }
  expect(cases).toBe(320);
  expect(digest.digest('hex')).toBe('135b22553ce1fdc26f39a2127cdc2cd01966e98ffcbfa9cef5dfdd3dcf629cb1');
});
