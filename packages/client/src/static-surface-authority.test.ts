import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
const painter = readFileSync(new URL('./gameplay-painter-placeables.ts', import.meta.url), 'utf8');

describe('active authored static surface wiring', () => {
  it('does not restore exact surface-kind geometry branches', () => {
    expect(main).not.toContain("surface.kind === 'wooden_table'");
    expect(main).toContain('runtimeSpaceSurfaceObstacle(snapshot.content.registry, surface)');
  });

  it('fails stale surface rendering and quest interaction closed', () => {
    expect(painter).toContain('runtimeSpaceSurfaceDefinition(snapshot.content.registry, surface) === null');
    expect(main).toContain('runtimeSpaceSurfaceDefinition(snapshot.content.registry, surface) === null');
  });
});
