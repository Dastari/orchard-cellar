import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('active landmark world wiring', () => {
  it('resolves placement reservations and generated landmarks from the active topside space', () => {
    expect(source).toContain('activeSurvivalLandmarks(contentRegistry(ctx), TOPSIDE_SPACE_ID)');
    expect(source).toContain("survivalLandmarkRoleReservedAt(\n    activeTopsideLandmarks(ctx), 'wildlife_feed'");
    expect(source).not.toContain('survivalFarmerBobFarmReservedAt');
    expect(source).not.toContain('survivalAuthoredLandmarkDecorations');
    expect(source).not.toContain('generateMarlowCampPathTiles');
  });

  it('keys compiled island authority by active content and supplies landmarks to legacy parsing', () => {
    // Static world S3-final: the compiled island is the chunk materializer's (tools) reference now.
    const compiled = readFileSync(new URL('../../../scripts/world-chunk-compiled-island.ts', import.meta.url), 'utf8');
    const runtime = compiled.slice(compiled.indexOf('function compiledLiveIslandRuntime('));
    expect(source).not.toContain('function compiledLiveIslandRuntime(');
    expect(runtime).toContain('registry.contentHash');
    expect(runtime).toContain('createLiveIslandMapDocument({ landmarks })');
    expect(runtime).toContain('parseMapDocumentV3(row.documentJson, landmarks)');
    expect(runtime).toContain("document, generatedSuppressions, 'ground', landmarks");
  });

  it('uses active item projections for live capabilities instead of raw registry maps', () => {
    expect(source).not.toContain('contentRegistry(ctx).items.get(');
    expect(source).not.toContain('registry.items.get(');
    expect(source).toContain("runtimeItemHasTag(contentRegistry(ctx), row.itemKind, 'emits.light')");
    expect(source).toContain('runtimeDurabilityDefinition(contentRegistry(ctx), itemKind)');
  });
});
