import { describe, expect, it } from 'vitest';
import type { DirectionalCaster } from '@orchard/engine/directional-shadows';
import { sameStaticCasterCohort } from './static-caster-cohort.js';

const caster = (): DirectionalCaster => ({ owner: 1, worldX: 40, worldY: 60,
  baseHeightSubunits: 0, heightSubunits: 8, contact: true,
  footprint: { left: -4, right: 4, top: -2, bottom: 1 },
  silhouette: { width: 2, height: 2, anchorX: 1, anchorY: 2, opaque: new Uint8Array([1, 0, 1, 1]) } });

describe('exact static caster multiset identity', () => {
  it('retains equal rendering inputs across reordering, fresh immutable bytes and duplicate owners', () => {
    const a = caster(), b = { ...caster(), worldX: 80 }, c = { ...caster(), owner: '1' };
    expect(sameStaticCasterCohort([a, b, c], [{ ...c }, { ...b }, caster()])).toBe(true);
    expect(sameStaticCasterCohort([a, b], [caster(), caster()])).toBe(false);
    expect(sameStaticCasterCohort([a], [a, a])).toBe(false);
    expect(sameStaticCasterCohort([a, a], [a])).toBe(false);
    expect(sameStaticCasterCohort([a, c], [c, c])).toBe(false);
    expect(sameStaticCasterCohort([], [])).toBe(true);
  });

  it('invalidates on every rendering input, including a single silhouette byte', () => {
    const a = caster();
    const changed: DirectionalCaster[] = [
      ...(['worldX', 'worldY', 'baseHeightSubunits', 'heightSubunits'] as const).map(key => ({ ...a, [key]: a[key] + .25 })),
      { ...a, owner: 2 }, { ...a, contact: false }, { ...a, silhouette: undefined },
      ...(['left', 'right', 'top', 'bottom'] as const).map(key => ({ ...a, footprint: { ...a.footprint, [key]: a.footprint[key] + .25 } })),
      ...(['width', 'height', 'anchorX', 'anchorY'] as const).map(key => ({ ...a, silhouette: { ...a.silhouette!, [key]: a.silhouette![key] + 1 } })),
      { ...a, silhouette: { ...a.silhouette!, opaque: new Uint8Array([1, 0, 0, 1]) } },
      { ...a, silhouette: { ...a.silhouette!, opaque: new Uint8Array([1, 0, 1]) } },
    ];
    for (const next of changed) expect(sameStaticCasterCohort([a], [next])).toBe(false);
  });
});
