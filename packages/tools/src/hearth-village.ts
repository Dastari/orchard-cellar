import {type HearthBuildingAsset,type MapDocumentV3CellOverride,type MapObjectInstance,
  type MapPrefabDocumentV2} from '@orchard/sim';
import {WILLOWHARBOUR_PLOTS} from './hearth-archipelago-authoring.js';

/** Front wall foundations relative to the door-facing sprite foot. Roofs and
 * awnings are visual overhangs; the outside interaction tile is one row south. */
const FOUNDATIONS = {
  inn: [-4,5,-2], 'general-store': [-1,5,-2], carpenter: [-4,1,-2],
  furnisher: [-1,2,-1], smith: [-1,6,-2], guild: [-4,1,-2],
  'garden-cottage': [-1,2,-2], 'orchard-cottage': [-1,2,-1],
  barn: [-3,3,-3], greenhouse: [-2,2,-4],
} as const;

export function buildHearthVillageFacades(
  assetFor: (name: string) => HearthBuildingAsset,
  assetRegistryRevision: string,
): { readonly prefabs: readonly MapPrefabDocumentV2[]; readonly objects: readonly MapObjectInstance[] } {
  const prefabs: MapPrefabDocumentV2[] = [];
  const objects: MapObjectInstance[] = [];
  for (const plot of WILLOWHARBOUR_PLOTS) {
    const name = `building_cf_hearth_${plot.id.replaceAll('-','_')}`;
    const asset = assetFor(name);
    const pivot = { tileX: Math.floor(asset.anchor[0]/16), tileY: Math.floor(asset.anchor[1]/16) };
    const [left,right,back] = FOUNDATIONS[plot.id];
    const cells = [];
    for (let y=back; y<=0; y++) for (let x=left; x<=right; x++) {
      cells.push({ id: `foundation-${x-left}-${y-back}`, tileX: pivot.tileX+x,
        tileY: pivot.tileY+y, elevation: 0, collisionMask: 0xffff });
    }
    const prefabId = `hearth-village-${plot.id}`;
    prefabs.push({ schemaVersion: 2, kind: 'map_prefab', id: prefabId, title: plot.id.replaceAll('-',' '),
      width: Math.ceil(asset.width/16), height: Math.ceil(asset.height/16), tileSize: 16,
      pivot, revision: 1, assetRegistryRevision, tags: ['hearth.village','authored.building'],
      collection: { id: 'hearth-village', label: 'Willowharbour', color: '#d8b38a' },
      behaviors: [{ kind: 'static' }], cells,
      placements: [{ id: 'facade', assetId: asset.id, assetName: name,
        visual: { kind: 'state', name: 'base', frameIndex: 0 },
        ...pivot, elevation: 0, layer: 'object', quarterTurns: 0, flipX: false }],
    });
    objects.push({ id: prefabId, prefabId, prefabRevision: 1, tileX: plot.door.tileX,
      tileY: plot.door.tileY-1, elevation: 0, layer: 'objects', quarterTurns: 0, flipX: false, enabled: true });
  }
  return { prefabs, objects };
}

export const HEARTH_SCENERY_ASSETS = ['tree_cf_oak_mature','tree_cf_birch_mature',
  'tree_cf_fruit_mature','tree_cf_spruce_mature','prop_cf_farm_potted_flowers',
  'prop_cf_camp_bench','prop_cf_flowers_pink','prop_cf_flowers_gold',
  'prop_cf_hearth_stall_red','prop_cf_hearth_stall_blue','prop_cf_hearth_stall_gold',
  'prop_cf_hearth_bench','prop_cf_hearth_fountain','prop_cf_hearth_hedge_horizontal','prop_cf_hearth_hedge_vertical',
  'prop_cf_interior_table','prop_cf_camp_round_stool','prop_cf_workbench',
  'prop_cf_poi_fallen_log','prop_cf_barrel','prop_cf_anvil','prop_cf_chest',
  'vehicle_cf_boat','prop_cf_hearth_harbour_sign','prop_cf_furniture_rustic_runner',
  'prop_cf_furniture_rustic_bookshelf','prop_cf_furniture_rustic_standing_lamp','prop_cf_standing_torch',
  'prop_cf_fence_horizontal','prop_cf_fence_vertical','prop_cf_farm_hay_bale','prop_cf_farm_hay_stack',
  'crop_cf_carrot_mature','crop_cf_wheat_mature',
  'prop_cf_hearth_bridge_left_north','prop_cf_hearth_bridge_left_deck','prop_cf_hearth_bridge_left_south',
  'prop_cf_hearth_bridge_middle_north','prop_cf_hearth_bridge_middle_deck','prop_cf_hearth_bridge_middle_south',
  'prop_cf_hearth_bridge_right_north','prop_cf_hearth_bridge_right_deck','prop_cf_hearth_bridge_right_south'] as const;

const groundScenery=(name:string):boolean=>name.endsWith('_deck')||name==='prop_cf_furniture_rustic_runner';

export function hearthSceneryVisual(name: string): { readonly name: string; readonly animated: boolean } {
  if(name==='prop_cf_standing_torch') return {name:'burn',animated:true};
  if(name==='vehicle_cf_boat') return { name: 'left', animated: true };
  if(name==='prop_cf_farm_potted_flowers') return { name: 'sway', animated: true };
  if(name==='prop_cf_hearth_fountain') return { name: 'flow', animated: true };
  if(name==='prop_cf_anvil') return { name: 'animate', animated: true };
  if(name==='prop_cf_barrel') return { name: 'closed', animated: false };
  if(name==='prop_cf_chest') return { name: 'chest', animated: false };
  return { name: 'base', animated: false };
}

/** Stable town greenery only; never passed into the original resource generator.
 * Service approaches and whole reserved plots stay clear of trunks and canopies. */
export function buildHearthVillageScenery(
  cells: Readonly<Record<string, MapDocumentV3CellOverride>>,
  assetFor: (name: string) => HearthBuildingAsset,
  assetRegistryRevision: string,
): { readonly prefabs: readonly MapPrefabDocumentV2[]; readonly objects: readonly MapObjectInstance[] } {
  const prefabs = HEARTH_SCENERY_ASSETS.map((name): MapPrefabDocumentV2 => {
    const asset=assetFor(name), tree=name.startsWith('tree_'), visual=hearthSceneryVisual(name);
    const pivot={ tileX: Math.floor(asset.anchor[0]/16), tileY: Math.floor(asset.anchor[1]/16) };
    const collisionCells=[];
    const decorative=name.includes('flowers') || name.startsWith('crop_') || groundScenery(name);
    const solidWidth=tree ? 1 : !decorative ? Math.ceil(asset.width/16) : 0;
    const solidRows=name==='prop_cf_hearth_fountain' ? 2 : 1;
    for(let y=0;y<solidRows;y++) for(let x=0;x<solidWidth;x++) collisionCells.push({
      id: `base-${x}-${y}`, tileX: tree ? pivot.tileX : x, tileY: pivot.tileY-y,
      elevation: 0, collisionMask: tree ? 0x0660 : 0xffff });
    return { schemaVersion: 2, kind: 'map_prefab', id: `hearth-${name.replaceAll('_','-')}`,
      title: name, width: Math.ceil(asset.width/16), height: Math.ceil(asset.height/16), tileSize: 16,
      pivot, revision: 1, assetRegistryRevision, tags: ['hearth.village','authored.scenery'],
      collection: { id: 'hearth-village', label: 'Willowharbour', color: '#d8b38a' },
      behaviors: [{ kind: 'static' }],
      cells: collisionCells,
      placements: [{ id: 'visual', assetId: asset.id, assetName: name, visual: { kind: visual.animated ? 'animation' : 'state', name: visual.name, frameIndex: 0 },
        ...pivot, elevation: 0, layer: tree ? 'canopy' : groundScenery(name) ? 'ground' : 'object', quarterTurns: 0, flipX: false }],
    };
  });
  const objects: MapObjectInstance[]=[];
  const occupied=new Set<string>();
  const put=(name: typeof HEARTH_SCENERY_ASSETS[number],x: number,y: number): void => {
    const key=`${x},${y}`;
    if(occupied.has(key)) return;
    occupied.add(key);
    objects.push({ id: `hearth-scenery-${x}-${y}`, prefabId: `hearth-${name.replaceAll('_','-')}`,
      prefabRevision: 1, tileX: x, tileY: y, elevation: 0,
      layer: name.startsWith('tree_') ? 'canopy' : groundScenery(name) ? 'ground' : 'objects', quarterTurns: 0, flipX: false, enabled: true });
  };
  const clear=(x: number,y: number): boolean => {
    if(x>=109 && x<=151 && y>=431 && y<=453) return false;
    if (WILLOWHARBOUR_PLOTS.some(p=>x>=p.minX-3 && x<=p.maxX+3 && y>=p.minY-3 && y<=p.maxY+3)) return false;
    for (let dy=-3;dy<=2;dy++) for (let dx=-2;dx<=2;dx++) {
      if (cells[`${x+dx},${y+dy}`]?.biome!=='meadow') return false;
    }
    return true;
  };
  for (let y=328;y<472;y+=4) for (let x=72;x<216;x+=4) {
    const hash=(Math.imul(x+73,73856093)^Math.imul(y+19,19349663)^0x48454152)>>>0;
    const px=x+(hash%3)-1, py=y+((hash>>>4)%3)-1;
    const density = px<120 || py<362 ? 68 : 28;
    if (hash%100>=density || !clear(px,py)) continue;
    put(HEARTH_SCENERY_ASSETS[(hash>>>8)%4]!,px,py);
  }
  for (const p of WILLOWHARBOUR_PLOTS.filter(p=>p.enterable)) {
    put('prop_cf_furniture_rustic_runner',p.door.tileX,p.door.tileY);
    put('prop_cf_standing_torch',p.door.tileX+3,p.door.tileY+(p.id==='general-store'?5:2));
    put('prop_cf_farm_potted_flowers',p.door.tileX-2,p.door.tileY);
    put('prop_cf_farm_potted_flowers',p.door.tileX+2,p.door.tileY);
  }
  // Separate ground deck and solid rail modules retain native scale and actor depth.
  for(const [left,right,north] of [[130,150,378],[212,219,399]] as const) {
    for(let x:number=left;x<=right;x++) {
      const end=x===left?'left':x===right?'right':'middle';
      put(`prop_cf_hearth_bridge_${end}_north`,x,north);
      put(`prop_cf_hearth_bridge_${end}_deck`,x,north+2);
      put(`prop_cf_hearth_bridge_${end}_south`,x,north+3);
    }
  }
  // Cultivated beds remain visual farmland, separate from player-owned soil.
  for(const [left,right,crop] of [[136,140,'crop_cf_carrot_mature'],[144,148,'crop_cf_wheat_mature']] as const) {
    for(let y=434;y<=438;y+=2) for(let x=left;x<=right;x++) put(crop,x,y);
  }
  // Farm pen east of the barn, opening onto the public lane through a two-tile gap.
  for(let x=121;x<=127;x++) {
    put('prop_cf_fence_horizontal',x,442); put('prop_cf_fence_horizontal',x,451);
  }
  for(let y=443;y<451;y++) {
    put('prop_cf_fence_vertical',121,y);
    if(y!==447 && y!==448) put('prop_cf_fence_vertical',127,y);
  }
  put('prop_cf_farm_hay_stack',124,444);
  put('prop_cf_farm_hay_bale',123,445); put('prop_cf_farm_hay_bale',125,450);
  for(const [x,y] of [[201,399],[211,396],[129,377],[151,377],[132,449],[154,407]] as const) {
    put('prop_cf_standing_torch',x,y);
  }
  // Native moored boat remains seaward; travel still uses the existing ferry.
  put('vehicle_cf_boat',221,400);
  put('prop_cf_hearth_harbour_sign',202,396);
  // Compact cargo yard beside the store; keep the guide and ferry approach open.
  put('prop_cf_barrel',200,396); put('prop_cf_chest',201,397);
  put('prop_cf_hearth_stall_red',167,396); put('prop_cf_hearth_stall_blue',172,396);
  put('prop_cf_hearth_stall_gold',182,402);
  put('prop_cf_barrel',166,398); put('prop_cf_chest',171,398);
  put('prop_cf_barrel',183,403);
  put('prop_cf_hearth_fountain',175,401);
  put('prop_cf_hearth_bench',170,404); put('prop_cf_hearth_bench',179,404);
  for(const plot of WILLOWHARBOUR_PLOTS) {
    const residence=plot.id==='garden-cottage' || plot.id==='orchard-cottage';
    if(!residence && plot.id!=='guild') continue;
    const asset=assetFor(`building_cf_hearth_${plot.id.replaceAll('-','_')}`);
    const left=plot.door.tileX-Math.floor(asset.anchor[0]/16)-1;
    const right=left+Math.ceil(asset.width/16)+1;
    const back=plot.door.tileY-Math.ceil(asset.height/16)-1;
    const front=plot.door.tileY+2;
    const hedge=(x: number,y: number,vertical: boolean): void => {
      if(cells[`${x},${y}`]?.biome!=='meadow') return;
      if(!residence && y>plot.door.tileY-4) return;
      // Leave a broad entrance and any existing public pavement unobstructed.
      if(y===front && Math.abs(x-plot.door.tileX)<=2) return;
      put(vertical?'prop_cf_hearth_hedge_vertical':'prop_cf_hearth_hedge_horizontal',x,y);
    };
    for(let x=left;x<=right;x++) { hedge(x,back,false); hedge(x,front,false); }
    for(let y=back+1;y<front;y++) { hedge(left,y,true); hedge(right,y,true); }
  }
  put('prop_cf_barrel',158,393);
  put('prop_cf_chest',195,403);
  put('prop_cf_furniture_rustic_bookshelf',176,384);
  put('prop_cf_furniture_rustic_standing_lamp',174,423);
  put('prop_cf_interior_table',160,391);
  put('prop_cf_camp_round_stool',159,393); put('prop_cf_camp_round_stool',161,393);
  put('prop_cf_workbench',138,400);
  put('prop_cf_poi_fallen_log',137,402); put('prop_cf_poi_fallen_log',139,404);
  put('prop_cf_anvil',194,422); put('prop_cf_barrel',195,424);
  put('prop_cf_interior_table',173,419);
  put('prop_cf_camp_round_stool',172,421); put('prop_cf_camp_round_stool',174,421);
  put('prop_cf_chest',172,423);
  for (const [x,y] of [[151,386],[153,386],[156,387],[180,390],[181,389],[160,418],[162,418]] as const) {
    put((x+y)%2===0?'prop_cf_flowers_pink':'prop_cf_flowers_gold',x,y);
  }
  return { prefabs,objects };
}
