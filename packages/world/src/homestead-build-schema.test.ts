import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('homestead build authority schema', () => {
  it('keeps private placement provenance and authoritative build reducers', () => {
    expect(source).toContain("name: 'world_placeable_build'");
    expect(source).toContain('export const placeHomesteadBuildable = spacetimedb.reducer');
    expect(source).toContain('export const removeHomesteadBuildable = spacetimedb.reducer');
    expect(source).toContain('homesteadBuildRemovalRefund(');
    expect(source).toContain("throw new SenderError('placeable_not_empty')");
  });
});
