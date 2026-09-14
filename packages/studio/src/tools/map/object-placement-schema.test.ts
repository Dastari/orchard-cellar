import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const model = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('./canvas.ts', import.meta.url), 'utf8');
const controller = readFileSync(new URL('./editor-controller.ts', import.meta.url), 'utf8');

describe('Map Editor object placement mode', () => {
  it('places only an explicit object command and never selects a generated default', () => {
    expect(model).toContain('placeObject(object: MapObjectInstance)');
    expect(model).toContain("this.apply({ kind: 'place_object', object })");
    expect(model).not.toContain('generatedObjectPrefabs[0]?.id');
    expect(canvas).not.toContain('generatedObjectPrefabs[0]?.id');
  });

  it('routes object and tile picks through the shared shell selection bus', () => {
    expect(controller).toContain('this.model.selectObject(object.id)');
    expect(controller).toContain('this.model.selectTile(tileX, tileY)');
    expect(model).toContain("entityKind: 'map-object'");
  });
});
