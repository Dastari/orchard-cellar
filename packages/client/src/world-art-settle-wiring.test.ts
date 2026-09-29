import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Static world S6 (art by need): the first arrival keeps the loading screen over the world until a
 * frame draws no lazy stand-in (bounded), and input waits with it. */
describe('first-arrival world art settle', () => {
  const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
  it('covers the world until a frame draws no stand-in, bounded, and gates input on it', () => {
    expect(source).toContain('const WORLD_ART_SETTLE_TIMEOUT_MS = 8_000;');
    expect(source).toMatch(/function worldClientReady\(\): boolean \{\n\s+return network\.gameplayReady && currentWorldLoadingStage\(\)\.ready === true && worldArtSettled;/);
    const frame = source.slice(source.indexOf('function renderFrame('), source.indexOf('function settleWorldArt('));
    expect(frame.indexOf('const standInsBeforeFrame = lazyArtStandInReads();')).toBeGreaterThan(frame.indexOf("lastFramePresentation = 'playing';"));
    expect(frame.lastIndexOf('settleWorldArt(standInsBeforeFrame, performance.now());')).toBeGreaterThan(frame.lastIndexOf('renderer.endUi();'));
    const settle = source.slice(source.indexOf('function settleWorldArt('), source.indexOf('function settleWorldArt(') + 900);
    expect(settle).toContain('lazyArtStandInReads() === standInsBeforeFrame || now - worldArtWaitStartedAt >= WORLD_ART_SETTLE_TIMEOUT_MS');
    expect(settle).toContain('drawInitialWorldLoading(');
  });
});
