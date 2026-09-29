import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
const setup = readFileSync(new URL('./gameplay-painter-setup.ts', import.meta.url), 'utf8');
const decorations = readFileSync(new URL('./gameplay-painter-decorations.ts', import.meta.url), 'utf8');
const topside = readFileSync(new URL('./topside-map-records.ts', import.meta.url), 'utf8');

describe('active landmark client wiring', () => {
  it('uses active semantic landmark roles for draw, collision, placement and paths', () => {
    expect(main).toContain('activeSurvivalLandmarks(snapshot.content.registry, TOPSIDE_SPACE_ID)');
    // Static world S6: topside landmark decorations come only from chunk records (no generator in the client).
    expect(topside).not.toMatch(/generateSurvival/u);
    expect(main).not.toMatch(/generateSurvival(?:Landmark|Procedural)?Decorations\(/u);
    expect(main).toContain("activeTopsideLandmarks(snapshot), 'wildlife_feed'");
    expect(main).toContain("activeTopsideLandmarks(snapshot), 'automated_campfire'");
    expect(main).not.toContain('survivalFarmerBobFarmReservedAt');
    expect(main).not.toContain('survivalAuthoredLandmarkDecorations');
    expect(main).not.toContain('generateMarlowCampPathTiles');
    expect(main).not.toContain('FARMER_JANE_GRAVE_TILE');
    expect(main).toContain('runtimeLandmarkCampfirePlans(snapshot.content.registry)');
    expect(main).toContain("network.interactEntity('placeable', target.placeable.id, 'use')");
    expect(main).not.toContain('activeLandmarkInteractionPoint(');
  });

  it('derives watered farm soil from authored roles rather than decoration ids', () => {
    const start = main.indexOf('const authoredFarmerSoil =');
    const end = main.indexOf('renderItems += drawFarmSoil(', start);
    const projection = main.slice(start, end);
    expect(projection).toContain("watered: decoration.role === 'soil.watered'");
    expect(projection).not.toContain('farm_crop_strawberry');
    expect(projection).not.toContain('farm_crop_sunflower');
  });

  it('passes the active registry through every painter live-map projection', () => {
    // Static world S4e, S6: painters draw the one topside record source overworld-main resolves
    // with the active registry: the chunk window's records (the client has no live document).
    expect(main).toContain('topsideMapRecordsFrom(worldSource, snapshot.content.registry)');
    expect(main).not.toMatch(/liveMapDocument|liveIslandDocument/u);
    expect(setup).toContain('enqueueMapObjects(topsideMapRecords, {');
    expect(decorations).toContain('mapObjectPointLights(topsideMapRecords,snapshot.content.registry,');
    expect(decorations.match(/\btopsideMapRecords\b/g)).toHaveLength(5);
    for (const painter of [setup, decorations]) expect(painter).not.toMatch(/liveMapDocument|liveIslandDocument/u);
  });

  it('fails retired full item content closed before reading its active payload', () => {
    const start = main.indexOf('function liveItemContentDefinition(');
    const end = main.indexOf('function itemDescription(', start);
    const resolver = main.slice(start, end);
    expect(resolver.indexOf('runtimeItemDefinition(snapshot.content.registry, itemKind)'))
      .toBeGreaterThanOrEqual(0);
    expect(resolver.indexOf('snapshot.content.registry.items.get(`item:${itemKind}`)'))
      .toBeGreaterThan(resolver.indexOf('runtimeItemDefinition(snapshot.content.registry, itemKind)'));
  });
});
