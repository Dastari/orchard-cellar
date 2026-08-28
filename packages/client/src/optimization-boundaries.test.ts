import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const overworld = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
const assetLoader = readFileSync(new URL('./render/assets.ts', import.meta.url), 'utf8');
const atlasBuilder = readFileSync(new URL('../../tools/src/build-atlas.ts', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

describe('client optimization boundaries', () => {
  it('keeps terrain diagnostics out of the initial gameplay module graph', () => {
    expect(overworld).not.toContain("from './render/terrain-inspector.js'");
    expect(overworld).toContain("import('./render/terrain-inspector.js')");
  });

  it('stops visual simulation while the page is hidden', () => {
    expect(overworld).toContain('if (document.hidden)');
    expect(overworld).toContain('loop.stop()');
    expect(overworld).toContain("network.setMovementIntent('idle', false)");
  });

  it('loads atlas recolouring pixels only when an override is requested', () => {
    expect(atlasBuilder).toContain("new URL('atlas.markers.json', outputRoot)");
    expect(atlasBuilder).toContain("new URL('atlas.meta.json', outputRoot), JSON.stringify(runtimeMetadata)");
    expect(atlasBuilder).toContain('atlas_${category}.meta.json');
    expect(assetLoader).toContain("fetch(`/generated/atlas.markers.json?rev=");
    expect(assetLoader).toContain('Object.keys(markerOverrides).length === 0');
  });

  it('uses stable bounded chunks for the major runtime domains', () => {
    expect(vite).toContain('chunkSizeWarningLimit: 250');
    for (const chunk of [
      'spacetime-runtime', 'world-bindings', 'simulation',
      'client-network', 'game-ui', 'canvas-rendering',
    ]) expect(vite).toContain(`name: '${chunk}'`);
  });
});
