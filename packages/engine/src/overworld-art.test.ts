import { bootstrapContentRegistry, runtimeCreaturePresentation, type ContentRegistry, type CropContentDefinition, type ItemContentDefinition } from '@orchard/sim';
import type { LoadedAsset } from '@orchard/ui';
import { describe, expect, it, vi } from 'vitest';
import { authoredResourceVisual, type OverworldArt } from './overworld-art.js';
import { authoredActorShadowBody, authoredWildlifeAnimationName, authoredWildlifeFlipsForDirection, BOW_LOCOMOTION_SPLIT_ROW, MOUNTED_ACTION_Y_OFFSET, actionToolFlipsForDirection, additionalTerrainAssetIds, axeAnimationForDirection, avatarAnimationForDirection, boatCardinalFacing, boatFlipsForDirection, boatRiderLayerMaximumRows, boatRiderOffset, boatTravelBob, bowLocomotionBobOffset, capybaraVisualAtFrame, createOverworldContentArtRequests, drawOverworldItem, GROUND_DROP_PROP_ITEMS, heldLightAnimationForDirection, heldLightFrameIndices, horseFlipsForDirection, horseFrameForDirection, horseJumpPose, idleAvatarAnimationForDirection, isOverworldRoad, isPondWaterPixel, natureDecorationFrame, overworldItemIconKey, overworldPlaceableVisualScale, overworldPoiDecorationDepthY, pondShimmerFrameAtTick, sortWorldDrawItems, wildlifeAnimationName, wildlifeFlipsForDirection } from './overworld-art.js';
import { canonicalBlob47Index } from './tilemap.js';

describe('overworld art topology', () => {
  it('requests renamed active item and crop art by authored key once and fails closed otherwise', async () => {
    const sharedAsset = 'item_cf_wooden_pickaxe';
    const bootstrap = bootstrapContentRegistry();
    const item: ItemContentDefinition = {
      ...bootstrap.items.get('item:pickaxe')!,
      id: 'item:renamed_pick',
      icon: { asset: sharedAsset },
    };
    const retired: ItemContentDefinition = {
      ...item, id: 'item:retired_pick', retired: true,
    };
    const crop: CropContentDefinition = {
      ...bootstrap.crops.get('crop:turnip')!,
      id: 'crop:renamed_turnip',
      asset: sharedAsset,
    };
    const registry = {
      items: new Map([[item.id, item], [retired.id, retired]]),
      crops: new Map([[crop.id, crop]]),
    } as Pick<ContentRegistry, 'items' | 'crops'>;
    const loaded = { name: sharedAsset } as LoadedAsset;
    const loader = vi.fn(async () => loaded);
    const requests = createOverworldContentArtRequests(registry, loader);

    const [first, duplicate, reusedByCrop] = await Promise.all([
      requests.item('renamed_pick'),
      requests.item('renamed_pick'),
      requests.crop('renamed_turnip'),
    ]);

    expect(first).toBe(loaded);
    expect(duplicate).toBe(loaded);
    expect(reusedByCrop).toBe(loaded);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(sharedAsset);
    await expect(requests.item('retired_pick')).resolves.toBeNull();
    await expect(requests.item('missing_pick')).resolves.toBeNull();
    await expect(requests.crop('missing_turnip')).resolves.toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('grounds padded animal bodies from clean resting bounds without a pixel readback', () => {
    const frame = { x: 0, y: 0, width: 32, height: 32, durationTicks: 0 };
    const asset = { anchor: [16, 31], metadata: { animations: { idle_side: [frame] } },
      bakedShadow: { frames: { idle_side: [{ bodyBounds: [8, 10, 25, 22] }] } } } as unknown as LoadedAsset;
    expect(authoredActorShadowBody(asset, 'idle_side')).toEqual({ offsetY: -9, heightPixels: 12, halfWidth: 17 / 3, contact: true });
    expect(authoredActorShadowBody(asset, 'idle_side', true)).toMatchObject({ offsetY: 0, contact: false });
    expect(authoredActorShadowBody({ ...asset, bakedShadow: undefined }, 'idle_side')).toBeUndefined();
  });
  it('loads every additional terrain registry asset once and skips named preloads', () => {
    const assetIds = additionalTerrainAssetIds();
    expect(new Set(assetIds).size).toBe(assetIds.length);
    expect(assetIds).not.toEqual(expect.arrayContaining([
      'tile_cf_stone_cliff_variants',
      'tile_cf_stone_cliff_inverse_overlay',
      'tile_cf_cave_wall',
      'tile_cf_waterfall',
    ]));
    expect(assetIds).toEqual(expect.arrayContaining([
      'tile_cf_volcanic_ledge',
      'tile_cf_grass_1_ramp_bank_stone',
    ]));
  });

  it('renders the workbench at its native two-tile world footprint', () => {
    expect(overworldPlaceableVisualScale('workbench')).toBe(1);
    expect(overworldPlaceableVisualScale('barrel')).toBe(1);
  });

  it('sorts a tent at its walkable entrance boundary', () => {
    expect(overworldPoiDecorationDepthY('camp_tent', 160)).toBe(144);
    expect(overworldPoiDecorationDepthY('homestead_tent_marker', 160)).toBe(144);
    expect(overworldPoiDecorationDepthY('homestead_tent_large', 160)).toBe(144);
    expect(overworldPoiDecorationDepthY('camp_pond', 160)).toBe(112);
    expect(overworldPoiDecorationDepthY('camp_bench', 160)).toBe(160);
  });

  it('uses the generated atlas canonical blob ordering', () => {
    expect(canonicalBlob47Index(0, 0)).toBe(0);
    expect(canonicalBlob47Index(3, 1)).toBe(4);
    expect(canonicalBlob47Index(15, 15)).toBe(46);
  });

  it('lays two-tile roads between sixteen-tile parcels without a left-edge stripe', () => {
    expect(isOverworldRoad(0, 8)).toBe(false);
    expect(isOverworldRoad(15, 8)).toBe(true);
    expect(isOverworldRoad(16, 8)).toBe(true);
    expect(isOverworldRoad(17, 8)).toBe(false);
    expect(isOverworldRoad(8, 15)).toBe(true);
  });

  it('uses the side pose for diagonal travel when the licensed sheet has cardinal poses only', () => {
    expect(avatarAnimationForDirection('up')).toBe('walk_up');
    expect(avatarAnimationForDirection('upLeft')).toBe('walk_right');
    expect(avatarAnimationForDirection('upRight')).toBe('walk_right');
    expect(avatarAnimationForDirection('down')).toBe('walk_down');
    expect(idleAvatarAnimationForDirection('down')).toBe('idle_down');
    expect(idleAvatarAnimationForDirection('left')).toBe('idle_right');
    expect(idleAvatarAnimationForDirection('up')).toBe('idle_up');
  });

  it('uses the authored hold pose for portable lights', () => {
    expect(heldLightAnimationForDirection('down', false)).toBe('hold_idle_down');
    expect(heldLightAnimationForDirection('right', true)).toBe('hold_walk_right');
    expect(heldLightAnimationForDirection('left', true)).toBe('hold_walk_right');
    expect(heldLightAnimationForDirection('up', false)).toBe('hold_idle_up');
    expect(heldLightFrameIndices(true, 3, 11)).toEqual({ light: 11, hands: 3 });
    expect(heldLightFrameIndices(false, 3, 11)).toEqual({ light: 11, hands: 0 });
  });

  it('uses the licensed directional axe rows and mirrors side swings', () => {
    expect(axeAnimationForDirection('up')).toBe('axe_up');
    expect(axeAnimationForDirection('down')).toBe('axe_down');
    expect(axeAnimationForDirection('left')).toBe('axe_right');
    expect(axeAnimationForDirection('upRight')).toBe('axe_right');
    expect(actionToolFlipsForDirection('up')).toBe(false);
    expect(actionToolFlipsForDirection('down')).toBe(false);
    expect(actionToolFlipsForDirection('right')).toBe(false);
    expect(actionToolFlipsForDirection('upRight')).toBe(false);
    expect(actionToolFlipsForDirection('left')).toBe(true);
    expect(actionToolFlipsForDirection('downLeft')).toBe(true);
  });

  it('maps the horse and mounted sheets using their distinct direction row order', () => {
    expect(horseFrameForDirection('right', false, 0, false)).toBe(0);
    expect(horseFrameForDirection('down', false, 0, false)).toBe(2);
    expect(horseFrameForDirection('up', true, 5, false)).toBe(23);
    expect(horseFrameForDirection('down', false, 0, true)).toBe(0);
    expect(horseFrameForDirection('right', true, 5, true)).toBe(17);
    expect(horseFrameForDirection('up', true, 5, true)).toBe(23);
  });

  it('adapts the right-authored boat sprite to cardinal steering', () => {
    expect(boatCardinalFacing('right')).toBe('right');
    expect(boatCardinalFacing('left')).toBe('left');
    expect(boatCardinalFacing('up')).toBe('up');
    expect(boatCardinalFacing('down')).toBe('down');
    expect(boatCardinalFacing('upRight')).toBe('right');
    expect(boatCardinalFacing('downRight')).toBe('right');
    expect(boatCardinalFacing('upLeft')).toBe('left');
    expect(boatCardinalFacing('downLeft')).toBe('left');
  });

  it('keeps the rider seat on the hull centreline for every cardinal facing', () => {
    expect(boatRiderOffset('right')).toEqual({ x: 0, y: 26 });
    expect(boatRiderOffset('down')).toEqual({ x: 0, y: 12 });
    expect(boatRiderOffset('left')).toEqual({ x: 0, y: 26 });
    expect(boatRiderOffset('up')).toEqual({ x: 0, y: 21 });
    expect(boatRiderOffset('upLeft')).toEqual({ x: 0, y: 26 });
  });

  it('keeps an idle rider still and synchronizes travel with the boat bob', () => {
    expect([0, 1, 2, 3].map((frame) => boatTravelBob(false, frame))).toEqual([0, 0, 0, 0]);
    expect([0, 1, 2, 3, 4].map((frame) => boatTravelBob(true, frame))).toEqual([0, 1, 2, 1, 0]);
    expect(boatRiderOffset('right', true, 2)).toEqual({ x: 0, y: 28 });
    expect(boatRiderOffset('down', true, 2)).toEqual({ x: 0, y: 14 });
  });

  it('mirrors west-facing boats without turning the hull upside down', () => {
    expect(boatFlipsForDirection('left')).toBe(true);
    expect(boatFlipsForDirection('downLeft')).toBe(true);
    expect(boatFlipsForDirection('right')).toBe(false);
  });

  it('removes only leg layers from direct north/south boat riders', () => {
    expect(boatRiderLayerMaximumRows('up', false, 0)).toBe(18);
    expect(boatRiderLayerMaximumRows('down', false, 1)).toBe(0);
    expect(boatRiderLayerMaximumRows('up', false, 3)).toBe(0);
    expect(boatRiderLayerMaximumRows('down', false, 2)).toBeUndefined();
    expect(boatRiderLayerMaximumRows('upRight', false, 0)).toBeUndefined();
    expect(boatRiderLayerMaximumRows('up', true, 0)).toBe(28);
  });

  it('mirrors standalone and mounted horses from their opposite source orientations', () => {
    expect(horseFlipsForDirection('left', false)).toBe(false);
    expect(horseFlipsForDirection('right', false)).toBe(true);
    expect(horseFlipsForDirection('left', true)).toBe(true);
    expect(horseFlipsForDirection('right', true)).toBe(false);
  });

  it('selects authored locomotion, forage, sleep, and aquatic animation rows', () => {
    expect(wildlifeAnimationName('cow', 'up', true, 'up')).toBe('walk_up');
    expect(wildlifeAnimationName('pig', 'left', false, 'sleep')).toBe('sleep_side');
    expect(wildlifeAnimationName('chicken', 'right', false, 'graze')).toBe('forage_side');
    expect(wildlifeAnimationName('duck', 'left', true, 'left')).toBe('swim_side');
    expect(wildlifeAnimationName('frog', 'down', true, 'down')).toBe('hop_side');
    expect(wildlifeAnimationName('bee', 'up', true, 'up')).toBe('fly_side');
    expect(wildlifeAnimationName('vulture', 'left', false, 'sleep')).toBe('sleep_side');
    expect(wildlifeAnimationName('butterfly', 'left', false, 'rest')).toBe('flutter');
    expect(wildlifeAnimationName('vulture', 'up', true, 'up')).toBe('fly_up');
    expect(wildlifeAnimationName('cow', 'right', false, 'rest')).toBe('rest_side');
    expect(wildlifeAnimationName('cow', 'right', false, 'eat_hay')).toBe('action_side');
  });

  it('selects animation and source-facing from authored presentation without a species branch', () => {
    const presentation = runtimeCreaturePresentation(bootstrapContentRegistry(), 'vulture')!;
    const renamed = { ...presentation, assetFamily: 'moon_roc' };
    expect(authoredWildlifeAnimationName(renamed, 'up', true, 'up')).toBe('fly_up');
    expect(authoredWildlifeFlipsForDirection(renamed, 'left')).toBe(true);
    expect(authoredWildlifeFlipsForDirection(renamed, 'right')).toBe(false);
  });

  it('mirrors right-authored vulture flight independently from other animals', () => {
    expect(wildlifeFlipsForDirection('vulture', 'left')).toBe(true);
    expect(wildlifeFlipsForDirection('vulture', 'right')).toBe(false);
    expect(wildlifeFlipsForDirection('cow', 'left')).toBe(false);
    expect(wildlifeFlipsForDirection('cow', 'right')).toBe(true);
  });

  it('cycles capybaras through authored dive, bubbles, and emerge strips only in water', () => {
    expect(capybaraVisualAtFrame(50, true)).toBe('look');
    expect(capybaraVisualAtFrame(70, true)).toBe('dive');
    expect(capybaraVisualAtFrame(90, true)).toBe('bubbles');
    expect(capybaraVisualAtFrame(120, true)).toBe('emerge');
    expect(['idle', 'look']).toContain(capybaraVisualAtFrame(90, false));
  });

  it('aligns action-sheet riders with the authored mounted seat', () => {
    expect(MOUNTED_ACTION_Y_OFFSET).toBe(-10);
  });

  it('matches the walking body bob while compositing a bow upper body', () => {
    expect(BOW_LOCOMOTION_SPLIT_ROW).toBe(28);
    expect([0, 1, 2, 3, 4, 5].map(bowLocomotionBobOffset)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('reconstructs a deterministic mounted jump arc from authority timing', () => {
    expect(horseJumpPose(0, 0, 1_024, 0, 20n, 10)).toMatchObject({ x: 0, y: 0, footY: 0, progress: 0 });
    const middle = horseJumpPose(0, 0, 1_024, 0, 20n, 15);
    expect(middle?.x).toBe(512);
    expect(middle?.footY).toBe(0);
    expect(middle?.y).toBeLessThan(0);
    expect(horseJumpPose(0, 0, 1_024, 0, 20n, 20)).toMatchObject({ x: 1_024, y: 0, progress: 1 });
    expect(horseJumpPose(undefined, 0, 1_024, 0, 20n, 15)).toBeNull();
    expect(horseJumpPose(0, 0, 1_024, 0, 20n, 21)).toBeNull();
  });

  it('sorts world objects by foot point with a deterministic tie-break', () => {
    expect(sortWorldDrawItems([
      { footY: 32, tie: 'player' },
      { footY: 16, tie: 'tree' },
      { footY: 32, tie: 'apple' },
    ]).map((item) => item.tie)).toEqual(['tree', 'apple', 'player']);
  });

  it('renders ground drops using their actual inventory item art', () => {
    expect(overworldItemIconKey('axe')).toBe('icon_tool_wood_axe');
    expect(overworldItemIconKey('iron_axe')).toBe('icon_tool_iron_axe');
    expect(overworldItemIconKey('copper_pickaxe')).toBe('icon_tool_copper_pickaxe');
    expect(overworldItemIconKey('workbench')).toBe('prop_cf_workbench');
    expect(overworldItemIconKey('fiber')).toBe('icon_craft_fiber');
    expect(overworldItemIconKey('future_item')).toBe('system_missing_asset');
  });

  it('keeps the small prop sprites for fruit, pebble and loose arrow drops whose inventory icon is a 16px UI icon', () => {
    // Owner decision 2026-09-26 (wiki Roadmap/Item Slot Component): new slot icons, unchanged world drops.
    expect(GROUND_DROP_PROP_ITEMS).toEqual(['apple', 'pear', 'peach', 'cherry', 'pebble', 'arrow']);
    for (const kind of GROUND_DROP_PROP_ITEMS) expect(overworldItemIconKey(kind)).toBe(`icon_item_${kind}`);
    const asset = (name: string) => ({ name, image: { src: name }, anchor: [8, 15], metadata: { image: name, animations: { base: [{ x: 0, y: 0, width: 16, height: 16, durationTicks: 5 }] } } }) as unknown as LoadedAsset;
    const art = { oreItems: {}, groundItems: { pebble: asset('item_cf_pebble') }, itemIcons: { pebble: asset('icon_item_pebble'), stone: asset('item_cf_stone') }, missingItem: asset('system_missing_asset') } as unknown as OverworldArt;
    const drawn: unknown[] = [];
    const context = { save() {}, restore() {}, translate() {}, scale() {}, setTransform() {}, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), drawImage: (image: unknown) => drawn.push(image), imageSmoothingEnabled: false, filter: 'none', globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
    drawOverworldItem(context, art, 'pebble', 40, 40, 0, 0, 0, 1);
    drawOverworldItem(context, art, 'stone', 40, 40, 0, 0, 0, 1);
    expect(drawn).toEqual([{ src: 'item_cf_pebble' }, { src: 'item_cf_stone' }]);
  });

  it('draws an authored resource named for a nature family from that family', () => {
    const fishShadow = { name: 'nature_cf_fish_shadow_01' } as unknown as LoadedAsset;
    const missingItem = { name: 'system_missing_asset' } as unknown as LoadedAsset;
    const art = {
      hearthResources: {}, fruitTrees: {}, poiDecorations: {}, oreNodes: {},
      natureDecorations: { nature_fish_shadow: [fishShadow] },
      missingItem,
    } as unknown as OverworldArt;
    // The fishing pool names the decoration family, not one atlas entry.
    expect(authoredResourceVisual(art, { kind: 'fish', asset: 'nature_fish_shadow' }))
      .toEqual({ asset: fishShadow, scale: 1 });
    expect(authoredResourceVisual(art, { kind: 'fish', asset: 'nature_nothing_here' }))
      .toEqual({ asset: missingItem, scale: 1 });
  });

  it('rests vegetation in calm weather while fish and water continue moving', () => {
    expect(natureDecorationFrame('nature_grass', 25, 10, 0.29)).toBe(0);
    expect(natureDecorationFrame('nature_flower', 25, 10, 0.3)).toBe(7);
    expect(natureDecorationFrame('nature_lily_pad', 25, 10, 1)).toBe(7);
    expect(natureDecorationFrame('nature_fish_shadow', 25, 10, 0)).toBe(7);
    expect(natureDecorationFrame('nature_water_rock', 25, 10, 0)).toBe(7);
  });

  it('animates pond shimmer slowly and masks it to the authored blue palette', () => {
    expect(pondShimmerFrameAtTick(0)).toBe(0);
    expect(pondShimmerFrameAtTick(7)).toBe(0);
    expect(pondShimmerFrameAtTick(8)).toBe(1);
    expect(pondShimmerFrameAtTick(64)).toBe(0);
    expect(isPondWaterPixel(0x00, 0x6d, 0xa8)).toBe(true);
    expect(isPondWaterPixel(0x00, 0x95, 0xe9)).toBe(true);
    expect(isPondWaterPixel(0x3e, 0x89, 0x48)).toBe(false);
    expect(isPondWaterPixel(0x9c, 0x67, 0x54)).toBe(false);
  });
});
