import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, objectInteractionMetadata,
  runtimeLandmarkPlaceablePlans } from '@orchard/sim';

const world = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/overworld-main.ts', import.meta.url), 'utf8');

describe('generic landmark-placeable production authority', () => {
  it('projects the canonical memorial prompt, feedback, reach and exact durable location', () => {
    const registry = bootstrapContentRegistry();
    const plan = runtimeLandmarkPlaceablePlans(registry).find(({ runtimeId }) => runtimeId === 3100000138n)!;
    expect(plan).toMatchObject({ spaceId: 0, tileX: 390, tileY: 371 });
    expect(objectInteractionMetadata(plan.object, 'use', {})).toEqual({
      prompt: "READ FARMER JANE'S GRAVE",
      feedback: 'FARMER JANE — BELOVED WIFE AND GARDENER',
      reachTiles: 2.5,
    });
  });

  it('materializes insert-only during init and authenticated reconnect', () => {
    expect(world.match(/ensureLandmarkPlaceables\(ctx\)/gu)).toHaveLength(2);
    const materializer = world.slice(
      world.indexOf('function ensureLandmarkPlaceables'),
      world.indexOf('export const init'),
    );
    expect(materializer).toContain('runtimeLandmarkPlaceablePlans(contentRegistry(ctx))');
    expect(materializer).toContain('if (existing === null)');
    expect(materializer).not.toContain('world_placeable.id.update');
  });

  it('contains no client-only grave target, stable id, prompt or epitaph branch', () => {
    expect(client).not.toContain("kind: 'grave'");
    expect(client).not.toContain('farmer-jane-grave');
    expect(client).not.toContain("READ FARMER JANE'S GRAVE");
    expect(client).not.toContain('FARMER JANE — BELOVED WIFE AND GARDENER');
    expect(client).not.toContain("'farm_grave'");
    expect(client).toContain("network.interactEntity('placeable', target.placeable.id, 'use')");
    expect(client).toContain('target.presentation?.feedback ?? null');
  });
});
