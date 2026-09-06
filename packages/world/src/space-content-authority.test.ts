import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const rulesSource = readFileSync(new URL('./world-rules.ts', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../../sim/src/content/runtime.ts', import.meta.url), 'utf8');

describe('space live-content authority source guard', () => {
  it('routes every authoritative world space read through the durable live registry', () => {
    expect(worldSource).not.toContain('spaceDefinitionFor');
    expect(worldSource).toContain('runtimeSpaceDefinition(contentRegistry(ctx), spaceId, instanceRow)');
    expect(worldSource).toContain('activeSpaceDefinition(ctx, portal.fromSpace, sourceHomestead)');
    expect(worldSource).toContain('activeSpaceDefinition(ctx, portal.toSpace, destinationHomestead)');
  });

  it('requires a live registry for base collision and invalidates it by content hash', () => {
    expect(rulesSource).not.toContain('spaceDefinitionFor');
    expect(rulesSource).toContain('runtimeSpaceDefinition(registry, spaceId, instanceRow)');
    expect(rulesSource).toContain('`${registry.contentHash}:${spaceId}:${medium}:');
    expect(rulesSource).toMatch(/terrainCollisionForSpace\(\s*registry: ContentRegistry,/u);
    expect(rulesSource).toMatch(/createAuthoritySpaceCollisionMap\(\s*registry: ContentRegistry,/u);
  });

  it('does not give the live resolver a bootstrap escape hatch', () => {
    const start = runtimeSource.indexOf('export function runtimeSpaceDefinition(');
    const end = runtimeSource.indexOf('\nexport function ', start + 1);
    expect(start).toBeGreaterThanOrEqual(0);
    const helper = runtimeSource.slice(start, end < 0 ? runtimeSource.length : end);
    expect(helper).toContain('registry.compiled.spaces.find');
    expect(helper).toContain('instanceSpaceDefinitionFor');
    expect(helper).not.toMatch(/bootstrap|spaceDefinitionFor\(/u);
  });
});
