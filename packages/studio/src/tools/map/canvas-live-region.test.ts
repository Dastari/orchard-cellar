import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Map Canvas live region boundary', () => {
  it('reports the retained camera and finite map dimensions to the live adapter', () => {
    const source = readFileSync(new URL('./canvas.ts', import.meta.url), 'utf8');
    const start = source.indexOf("if (mapId === 'live-island') {");
    const end = source.indexOf('const parts = canvasParts();', start);
    const boundary = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(boundary).toContain('liveAdapter()?.setMapViewport?.({');
    for (const field of [
      'mapWidthTiles: document.width', 'mapHeightTiles: document.height',
      'cameraX: camera.x', 'cameraY: camera.y', 'zoom: camera.zoom',
      'viewportWidth: viewport.width', 'viewportHeight: viewport.height',
    ]) expect(boundary).toContain(field);
  });
});
