import { expect, it } from 'vitest';
import { sameProtocolDisplay, type GameplayDiagnosticState } from './gameplay-render-protocol.js';

it('accepts changing HUD telemetry while still rejecting changed capture geometry or policy', () => {
  const before: GameplayDiagnosticState['display'] = { dpr: 1, cssWidth: 1280, cssHeight: 720, worldZoom: 2,
    uiScale: 2, worldScale: '1x', backend: 'canvas2d', presentationCap: 'off',
    hudCache: { bytes: 11059200, caches: 3, builds: 3, reuses: 100, allocations: 3 } };
  expect(sameProtocolDisplay(before, { ...before, hudCache: { ...before.hudCache!, reuses: 1900 } })).toBe(true);
  expect(sameProtocolDisplay(before, { ...before, worldScale: 'native' })).toBe(false);
  expect(sameProtocolDisplay(before, { ...before, presentationCap: '30hz' })).toBe(false);
  expect(sameProtocolDisplay(before, { ...before, cssWidth: 1200 })).toBe(false);
  expect(sameProtocolDisplay(undefined, before)).toBe(false);
});
