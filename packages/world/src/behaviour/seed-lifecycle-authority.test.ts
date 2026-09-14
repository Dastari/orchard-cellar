import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../../../client/src/overworld-main.ts', import.meta.url), 'utf8');
const connectionSource = readFileSync(
  new URL('../../../client/src/net/overworld-connection.ts', import.meta.url),
  'utf8',
);

function between(source: string, startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('authored seed lifecycle authority', () => {
  it('keeps planting behind a complete authority preflight and atomic effect batch', () => {
    const writer = between(worldSource, 'function worldBehaviourEffectWriter(', '\nfunction applyWorldBehaviourEffects(');
    expect(writer).toContain("if (kind === 'plantSeed')");
    expect(writer).toContain("throw new SenderError('hands_occupied')");
    expect(writer).toContain('mutableFarmTileAuthorized(ctx, position, tileX, tileY)');
    expect(writer).toContain("throw new SenderError('mounted_action_forbidden')");
    expect(writer).toContain('3 * TILE_SIZE_FIXED');
    expect(writer).toContain("throw new SenderError('not_tilled')");
    expect(writer).toContain("throw new SenderError('crop_occupies_tile')");
    expect(writer).toContain('runtimeCropDefinitionForSeed(contentRegistry(ctx), selected.itemKind)');
    expect(writer).toContain('plannedSelectedConsumption !== 1');
    expect(writer).toContain('cropStoredKindForSeed(planned.seedItemKind, definition)');
    expect(writer).toContain("definition.harvestItemKind");
    expect(writer).toContain("'crops_planted', 1n");
    expect(writer).toContain("grantSkillExperience(ctx, ctx.sender, 'farming', 2n)");
  });

  it('retires the mixed plant/harvest reducer while preserving harvest as its own action', () => {
    expect(worldSource).not.toContain('export const useCropTile =');
    const harvest = between(worldSource, 'export const harvestCropTile =', '\nexport const tendTree =');
    expect(harvest).toContain("throw new SenderError('crop_not_found')");
    expect(harvest).not.toContain('runtimeCropDefinitionForSeed');
    expect(connectionSource).not.toContain('useCropTile(');
    expect(connectionSource).toContain('harvestCropTile(');
  });

  it('dispatches seed keyboard and pointer planting through generic useSelected place', () => {
    expect(clientSource).not.toContain('network.useCropTile(');
    expect(clientSource.match(/network\.useSelected\('place', \{ tileX: .*tileY:/gu)?.length ?? 0)
      .toBeGreaterThanOrEqual(2);
    expect(clientSource).toContain('network.harvestCropTile(target.crop.tileX, target.crop.tileY)');
    expect(clientSource).toContain(': network.harvestCropTile(farmTarget.tileX, farmTarget.tileY)');
    expect(clientSource).toContain("definition.assetKey.slice('crop_cf_'.length)");
  });
});
