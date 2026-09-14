import { afterEach, expect, it, vi } from 'vitest';
import { atlasRequestIdentity, installProtocolAssetRequests } from './render-protocol-asset-requests.js';
import type { GameplayDiagnosticState } from './gameplay-render-protocol.js';

afterEach(() => vi.unstubAllGlobals());

it('records effective quality at request dispatch, including preparation and restoration', () => {
  class Image { value = ''; get src() { return this.value; } set src(value: string) { this.value = value; } }
  vi.stubGlobal('HTMLImageElement', Image);
  const original = Object.getOwnPropertyDescriptor(Image.prototype, 'src');
  const state: { -readonly [K in keyof GameplayDiagnosticState['lighting']]: GameplayDiagnosticState['lighting'][K] } = {
    requestedQuality: 'dynamic', effectiveQuality: 'basic', model: 'unified', fallbackReason: 'preparing', retainedSurfaceBytes: 0,
  };
  const probe = installProtocolAssetRequests(() => state);
  try {
    const image = new Image();
    image.src = '/generated/atlas_trees_p000_summer.omit.png?rev=123';
    state.effectiveQuality = 'dynamic'; state.fallbackReason = null;
    image.src = '/generated/atlas_trees_p001_summer.omit.png?rev=123';
    state.requestedQuality = 'basic';
    image.src = '/generated/atlas_trees_p002_summer.omit.png?rev=123';
    image.src = ''; // Cancelling an in-flight request is not a new page request.
    expect(image.src).toBe('');
    expect(probe.requests.map(({ effectiveQuality, requestedQuality, fallbackReason }) =>
      [effectiveQuality, requestedQuality, fallbackReason])).toEqual([
      ['basic', 'dynamic', 'preparing'], ['dynamic', 'dynamic', null], ['dynamic', 'basic', null],
    ]);
    expect(probe.requests[0]).toMatchObject({ season: 'summer', variant: 'omit' });
    expect(() => installProtocolAssetRequests(() => state)).toThrow('already_installed');
  } finally { probe.dispose(); probe.dispose(); }
  expect(Object.getOwnPropertyDescriptor(Image.prototype, 'src')).toEqual(original);
});

it('bounds the log without suppressing requests or silently accepting lost evidence', () => {
  class Image { value = ''; get src() { return this.value; } set src(value: string) { this.value = value; } }
  vi.stubGlobal('HTMLImageElement', Image);
  const probe = installProtocolAssetRequests(() => ({ requestedQuality: 'basic', effectiveQuality: 'basic',
    model: 'classic', fallbackReason: null, retainedSurfaceBytes: 0 }), 1);
  try {
    const image = new Image(); image.src = '/atlas_a.png'; image.src = '/atlas_b.png';
    expect(probe.requests).toHaveLength(1); expect(probe.overflow).toBe(true);
    expect(image.src).toBe('/atlas_b.png');
  } finally { probe.dispose(); }
});

it('reads seasons from actual original and omit filenames, never a driver label', () => {
  expect(atlasRequestIdentity('/generated/atlas_characters_p003_winter.png?rev=spring')).toEqual({ season: 'winter', variant: 'original' });
  expect(atlasRequestIdentity('/generated/atlas_trees_p000_autumn.omit.png')).toEqual({ season: 'autumn', variant: 'omit' });
  expect(atlasRequestIdentity('/favicon.png')).toBeNull();
});
