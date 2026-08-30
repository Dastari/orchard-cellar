import { describe, expect, it } from 'vitest';
import {
  PWA_UPDATE_CHECK_INTERVAL_MS,
  pwaUpdateLabel,
  shouldSuppressGameShellGesture,
} from './pwa.js';

describe('PWA update presentation', () => {
  it('keeps update activation explicit and gives every lifecycle state a concise menu label', () => {
    expect(pwaUpdateLabel('current')).toBe('CHECK UPDATE');
    expect(pwaUpdateLabel('available')).toBe('UPDATE');
    expect(pwaUpdateLabel('updating')).toBe('UPDATING');
    expect(pwaUpdateLabel('error')).toBe('RETRY UPDATE');
    expect(pwaUpdateLabel('unsupported')).toBe('UPDATE UNAVAILABLE');
  });

  it('checks often enough for a long-running installed game session', () => {
    expect(PWA_UPDATE_CHECK_INTERVAL_MS).toBe(5 * 60 * 1_000);
  });

  it('blocks canvas-native gestures without interfering with text editing', () => {
    expect(shouldSuppressGameShellGesture('touchmove', true, false)).toBe(true);
    expect(shouldSuppressGameShellGesture('gesturestart', true, false)).toBe(true);
    expect(shouldSuppressGameShellGesture('wheel', true, false, true)).toBe(true);
    expect(shouldSuppressGameShellGesture('wheel', true, false, false)).toBe(false);
    expect(shouldSuppressGameShellGesture('touchmove', true, true)).toBe(false);
    expect(shouldSuppressGameShellGesture('touchmove', false, false)).toBe(false);
  });
});
