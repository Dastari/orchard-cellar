import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  bootstrapContentRows,
  bootstrapContentRegistry,
  contentDefinitionRowsHash,
  parseObjectDefinition,
} from '@orchard/sim';
import type { LoadedAsset } from '@orchard/ui';
import { LiveContentRegistry } from './live-content.js';
import { LiveObjectPresentationCache, emissiveSpriteLight } from './object-presentation.js';

const overworldSource = readFileSync(new URL('../overworld-main.ts', import.meta.url), 'utf8');
const placeablePainterSource = readFileSync(new URL('../gameplay-painter-placeables.ts', import.meta.url), 'utf8');
const lightPainterSource = readFileSync(new URL('../gameplay-painter-decorations.ts', import.meta.url), 'utf8');

const lamp = parseObjectDefinition({
  id: 'object:oil_lamp', kind: 'object', schemaVersion: 1, displayName: 'Oil Lamp',
  components: {
    placement: { item: 'item:oil_lamp_item', layer: 'object', spaces: ['homestead'], facing: false },
    sprite: { asset: 'prop_oil_lamp', animationByState: { lit: 'burn', default: 'base' } },
    collision: { footprint: [[15]], blocksMovement: true, occludesLight: true },
    states: { lit: { type: 'bool', default: false } },
    light: {
      when: { state: 'lit', equals: true }, color: [255, 196, 120],
      radiusTiles: 4, profile: 'steady', offsetY: -6,
    },
  },
});

function liveState() {
  const lampItem = { ...bootstrapContentRegistry().items.get('item:lantern')!, id: 'item:oil_lamp_item',
    tags: ['item.placeable'] };
  const rows = [...bootstrapContentRows(), { id: lamp.id, kind: lamp.kind, json: lamp },
    { id: lampItem.id, kind: lampItem.kind, json: lampItem }];
  const content = new LiveContentRegistry('object-presentation', null);
  return content.update({
    packId: 'live', revision: 7n, contentHash: contentDefinitionRowsHash(rows),
    engineVersion: 1, definitionCount: rows.length,
  }, rows);
}

const loadedAsset = {
  assetId: 44, name: 'prop_oil_lamp', image: {} as CanvasImageSource,
  anchor: [8, 16], collision: [], tags: [], placement: {}, atlasRevision: 1,
  metadata: { image: 'objects.png', animations: { base: [], burn: [] } },
} as unknown as LoadedAsset;

describe('live object presentation cache', () => {
  it('accepts reserved furniture support metadata without exposing it as authored state', () => {
    const content = new LiveContentRegistry('furniture', null).state;
    const cache = new LiveObjectPresentationCache(() => {}, async () => loadedAsset);
    const row = { id: 9n, kind: 'furniture_townhouse_table_lamp', definitionId: 'object:furniture_townhouse_table_lamp',
      open: false, lit: true, stateJson: '{"lit":true,"hearthFurnitureSupportId":"9007199254740993","hearthFurnitureRevision":"8"}' };
    expect(cache.resolve(content, row)).toMatchObject({ authored: true, stateJsonValid: true, light: { enabled: true } });
    expect(cache.resolve(content, row).state).not.toHaveProperty('hearthFurnitureSupportId');
    expect(cache.resolve(content, row).state).not.toHaveProperty('hearthFurnitureRevision');
    expect(cache.resolve(content, { ...row, stateJson: '{"hearthFurnitureRevision":"01"}' }).stateJsonValid).toBe(false);
    expect(cache.resolve(content, { ...row, stateJson: '{"lit":false,"hearthFurnitureSupportId":"9"}' }).light?.enabled).toBe(false);
    expect(cache.resolve(content, { ...row, stateJson: '{"hearthFurnitureSupportId":"01"}' }).stateJsonValid).toBe(false);
  });
  it('supplies a warm light only for a visible emissive state, centred on its flame', () => {
    const asset = { ...loadedAsset, emissiveFrames: { burn: [[10, 4, 2, 12, 4, 2]], off: [[]] } };
    expect(emissiveSpriteLight(asset, 'burn')).toEqual({ enabled: true,
      color: [255, 142, 62], radiusTiles: 4, profile: 'flicker', offsetY: -4.5 });
    expect(emissiveSpriteLight(asset, 'off')).toBeNull();
    expect(emissiveSpriteLight(asset, 'missing')).toBeNull();
    expect(emissiveSpriteLight(null, 'burn')).toBeNull();
  });
  it('projects authored collision state while preserving independent light occlusion metadata', () => {
    const base = new LiveContentRegistry('conditional-collision', null).state;
    const definition = parseObjectDefinition({
      id: 'object:moon_barrier', kind: 'object', schemaVersion: 1, displayName: 'Moon Barrier',
      components: {
        placement: { item: 'item:moon_kit', layer: 'object', spaces: ['homestead'], facing: false },
        states: { sealed: { type: 'bool', default: true } },
        collision: { footprint: [[15]], blocksMovement: true, occludesLight: true,
          when: { state: 'sealed', equals: true } },
      },
    });
    const content = { ...base, registry: { ...base.registry,
      objects: new Map([...base.registry.objects, [definition.id, definition]]) } };
    const cache = new LiveObjectPresentationCache();
    const row = { id: 2n, kind: 'moon_kit', definitionId: definition.id, open: true, lit: false };
    expect(cache.resolve(content, { ...row, stateJson: '{"sealed":true}' }).collision)
      .toEqual({ blocksMovement: true, occludesLight: true });
    expect(cache.resolve(content, { ...row, stateJson: '{"sealed":false}' }).collision)
      .toEqual({ blocksMovement: false, occludesLight: true });
    expect(cache.resolve(content, { ...row, stateJson: '{"sealed":"false"}' }))
      .toMatchObject({ authored: false, stateJsonValid: false,
        collision: { blocksMovement: true, occludesLight: true } });
  });
  it('renders the native two-tile workbench with matching placement and collision', () => {
    const content = new LiveContentRegistry('workbench-scale', null).state;
    const definition = content.registry.objects.get('object:workbench')!;
    const presentation = new LiveObjectPresentationCache().resolve(content, {
      id: 1n, kind: 'workbench', definitionId: definition.id, open: false, lit: false,
    });
    expect(presentation.sprite?.scale).toBe(1);
    expect(definition.components.placement?.footprint).toEqual([[15, 15]]);
    expect(definition.components.collision?.footprint).toEqual([[15, 15]]);
  });
  it('feeds the verified cache into authored sprites and shared point lights', () => {
    expect(overworldSource).toContain('new LiveObjectPresentationCache(');
    expect(overworldSource).toContain('objectPresentations.resolve(snapshot.content, placeable)');
    expect(overworldSource).toContain('enqueueGameplayPlaceables(painterContext)');
    expect(overworldSource).toContain('enqueueGameplayDecorations(painterContext)');
    expect(placeablePainterSource).toContain('drawAuthoredOverworldObject(');
    expect(lightPainterSource).toContain('placeablePointLight(placeable, snapshot.clock?.authorityTick ?? 0n, presentation.light)');
  });

  it('resolves renamed combat targets through active authored identity for render and selection', () => {
    expect(placeablePainterSource).toContain('runtimeObjectDefinition(snapshot.content.registry, reference)');
    expect(placeablePainterSource).toContain('runtimeObjectDamageable(snapshot.content.registry, reference)');
    expect(placeablePainterSource).toContain('definitionId: definition.id');
    expect(placeablePainterSource).not.toContain('drawOverworldArcheryTarget(');
    expect(overworldSource).toContain("'definitionId' in target");
    expect(overworldSource).toContain('runtimeObjectDefinition(snapshot.content.registry, combatTargetObjectReference(target))');
    expect(overworldSource).toContain('displayName: definition.displayName');
    expect(overworldSource).not.toContain("target.kind !== 'archery_target'");
  });

  it('keeps compiled rendering for definitions that are absent or invalid', () => {
    const cache = new LiveObjectPresentationCache();
    const bootstrap = new LiveContentRegistry('bootstrap-only', null).state;
    expect(cache.resolve(bootstrap, {
      id: 1n, kind: 'legacy_gate', open: true, lit: false,
    })).toEqual({
      definitionId: 'object:legacy_gate', authored: false, stateJsonValid: true,
      state: { open: true, lit: false }, sprite: null, light: null, collision: null,
    });
    expect(cache.resolve(liveState(), {
      id: 2n, kind: 'oil_lamp', open: false, lit: true,
      definitionId: lamp.id, stateJson: '{"lit":"yes"}',
    })).toMatchObject({ authored: false, stateJsonValid: false, sprite: null, light: null });
  });

  it('preserves legacy mirrors and refreshes the revision-keyed sprite after loading', async () => {
    const onReady = vi.fn();
    const load = vi.fn(async () => loadedAsset);
    const cache = new LiveObjectPresentationCache(onReady, load);
    const row = {
      id: 3n, kind: 'oil_lamp_item', open: false, lit: true,
      definitionId: '', stateJson: '{}',
    };
    const pending = cache.resolve(liveState(), row);
    expect(pending).toMatchObject({
      authored: true, state: { open: false, lit: true },
      sprite: { assetName: 'prop_oil_lamp', asset: null, animation: 'burn', scale: 1 },
      light: { enabled: true, radiusTiles: 4 },
      collision: { blocksMovement: true, occludesLight: true },
    });
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(cache.resolve(liveState(), row).sprite?.asset).toBe(loadedAsset);
    expect(load).toHaveBeenCalledOnce();
  });
});

it('uses ordered state overrides for art, emission, footprint and lighting together', () => {
  const content = liveState();
  const altered = { ...lamp, components: { ...lamp.components, overrides: [{ when: { lit: true },
    sprite: { asset: 'prop_other_lamp', animation: 'charged', scale: 2 }, light: false as const,
    collision: { blocksMovement: false, footprint: [[0]] }, lighting: { receivesGlobal: false, castsShadow: 'none' as const },
    target: { left: -2, right: 2, top: -8, bottom: 0 },
  }] } };
  const registry = { ...content.registry, objects: new Map([...content.registry.objects, [lamp.id, altered]]) };
  const cache = new LiveObjectPresentationCache(() => {}, async () => loadedAsset);
  const result = cache.resolve({ ...content, registry }, { id: 999n, kind: 'oil_lamp', definitionId: lamp.id,
    open: false, lit: true, stateJson: '{"lit":true}' });
  expect(result.sprite).toMatchObject({ assetName: 'prop_other_lamp', animation: 'charged', scale: 2 });
  expect(result.light?.enabled).toBe(false);
  expect(result.collision?.blocksMovement).toBe(false);
  expect(result.appearance).toMatchObject({ collision: { footprint: [[0]] },
    lighting: { receivesGlobal: false, castsShadow: 'none' }, target: { left: -2, right: 2, top: -8, bottom: 0 } });
});
