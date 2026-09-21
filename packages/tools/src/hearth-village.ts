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
  'wildlife_cf_chicken_01','wildlife_cf_cow_01','nature_cf_water_flower_01','nature_cf_water_flower_03','nature_cf_water_grass_01',
  'prop_cf_hearth_streetlamp','prop_cf_hearth_well','prop_cf_hearth_trough','prop_cf_hearth_scarecrow',
  'prop_cf_hearth_bench','prop_cf_hearth_fountain','prop_cf_hearth_hedge_horizontal','prop_cf_hearth_hedge_vertical',
  'prop_cf_interior_table','prop_cf_camp_round_stool','prop_cf_workbench',
  'prop_cf_poi_fallen_log','prop_cf_barrel','prop_cf_anvil','prop_cf_chest',
  'vehicle_cf_boat','prop_cf_hearth_harbour_sign','prop_cf_furniture_rustic_runner',
  'prop_cf_furniture_rustic_bookshelf','prop_cf_furniture_rustic_standing_lamp','prop_cf_standing_torch',
  'prop_cf_fence_horizontal','prop_cf_fence_vertical','prop_cf_farm_hay_bale','prop_cf_farm_hay_stack',
  'crop_cf_carrot_mature','crop_cf_wheat_mature',
  'nature_cf_grass_01','nature_cf_grass_02','nature_cf_rock_01','nature_cf_rock_04',
  'tree_cf_oak_young','tree_cf_fruit_small','tree_cf_birch_sapling',
  'prop_cf_barrel_apples','prop_cf_furniture_rustic_potted_fern',
  'prop_cf_poi_stump','sign_cf_crop_carrot','sign_cf_crop_wheat',
  'prop_cf_hearth_bridge_left_north','prop_cf_hearth_bridge_left_deck','prop_cf_hearth_bridge_left_south',
  'prop_cf_hearth_bridge_middle_north','prop_cf_hearth_bridge_middle_deck','prop_cf_hearth_bridge_middle_south',
  'prop_cf_hearth_bridge_right_north','prop_cf_hearth_bridge_right_deck','prop_cf_hearth_bridge_right_south'] as const;

const groundScenery=(name:string):boolean=>name.endsWith('_deck')||name==='prop_cf_furniture_rustic_runner';

export function hearthSceneryVisual(name: string): { readonly name: string; readonly animated: boolean } {
  if(name.startsWith('wildlife_')) return {name:'idle_side',animated:true};
  if(name.startsWith('nature_cf_grass_')||name.startsWith('nature_cf_water_')) return {name:'sway',animated:true};
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
    const decorative=name.startsWith('wildlife_') || name.startsWith('nature_cf_') && !name.includes('_rock_') || name.includes('flowers') || name.startsWith('crop_') || groundScenery(name);
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
      prefabRevision: 1, tileX: x, tileY: y, elevation: cells[`${x},${y}`]?.elevation??0,
      layer: name.startsWith('tree_') ? 'canopy' : groundScenery(name) ? 'ground' : 'objects', quarterTurns: 0, flipX: false, enabled: true });
  };
  const clear=(x: number,y: number,ignoreTrees=false): boolean => {
    if(x>=109 && x<=151 && y>=431 && y<=453) return false;
    if (WILLOWHARBOUR_PLOTS.some(p=>x>=p.minX-3 && x<=p.maxX+3 && y>=p.minY-3 && y<=p.maxY+3)) return false;
    for (let dy=-3;dy<=2;dy++) for (let dx=-2;dx<=2;dx++) {
      const cell=cells[`${x+dx},${y+dy}`];
      if (cell?.biome!=='meadow'||(cell.elevation??0)!==(cells[`${x},${y}`]?.elevation??0)) return false;
      if(occupied.has(`${x+dx},${y+dy}`)&&(!ignoreTrees||!objects.some(o=>o.tileX===x+dx&&o.tileY===y+dy&&o.layer==='canopy')))return false;
    }
    return true;
  };
  for (const p of WILLOWHARBOUR_PLOTS.filter(p=>p.enterable)) {
    put('prop_cf_furniture_rustic_runner',p.door.tileX,p.door.tileY);
    put('prop_cf_hearth_streetlamp',p.door.tileX+3,p.door.tileY+(p.id==='general-store'?5:2));
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
    put('prop_cf_hearth_streetlamp',x,y);
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
  // Outdoor rooms: a sheltered inn garden, civic green, craft yards and kitchen gardens.
  for(let x=156;x<=174;x++) {
    put('prop_cf_hearth_hedge_horizontal',x,380);
    if(x<163||x>167)put('prop_cf_hearth_hedge_horizontal',x,393);
  }
  for(let y=381;y<393;y++) {
    put('prop_cf_hearth_hedge_vertical',156,y);
    put('prop_cf_hearth_hedge_vertical',174,y);
  }
  for(const [x,y] of [[159,387],[171,389],[181,387],[186,408],[159,417],[151,399]] as const)
    put('prop_cf_farm_potted_flowers',x,y);
  put('prop_cf_interior_table',170,391);
  put('prop_cf_camp_round_stool',169,392);put('prop_cf_camp_round_stool',172,392);
  // Garden island softens the large market apron while keeping its central crossing open.
  for(const [x,y] of [[178,397],[180,397]] as const)put('prop_cf_farm_potted_flowers',x,y);
  put('prop_cf_hearth_bench',183,388);put('prop_cf_hearth_bench',159,412);
  put('prop_cf_hearth_harbour_sign',162,397);
  put('prop_cf_barrel',185,397);put('prop_cf_chest',185,399);
  put('prop_cf_workbench',140,396);put('prop_cf_poi_stump',138,397);
  put('prop_cf_poi_fallen_log',135,401);put('prop_cf_poi_fallen_log',135,403);
  put('prop_cf_barrel',192,418);put('nature_cf_rock_04',194,418);
  put('prop_cf_fence_horizontal',190,427);put('prop_cf_fence_horizontal',192,427);
  // The cottage garden beds have deliberate openings onto the existing lanes.
  for(const [left,right,y] of [[118,121,381],[116,120,429],[107,110,429]] as const)
    for(let x=left;x<=right;x++)put(x%2?'prop_cf_flowers_pink':'prop_cf_flowers_gold',x,y);
  for(const [x,y] of [[118,375],[126,375],[108,424],[115,424],[134,438],[151,438]] as const)
    put('prop_cf_farm_potted_flowers',x,y);
  put('sign_cf_crop_carrot',135,439);put('sign_cf_crop_wheat',149,439);
  put('prop_cf_barrel',139,452);put('prop_cf_farm_hay_bale',113,456);
  put('prop_cf_farm_hay_stack',120,456);put('prop_cf_workbench',147,451);
  // Ornamental orchard rows are intentional cultivation; wild woodland below is clustered.
  for(const [x,y] of [[117,416],[123,414],[125,420],[121,425],[160,436],[166,439],[171,443]] as const)
    if(clear(x,y))put('tree_cf_fruit_mature',x,y);

  put('prop_cf_hearth_well',134,389);
  put('wildlife_cf_cow_01',124,447);put('wildlife_cf_chicken_01',126,444);
  put('wildlife_cf_chicken_01',122,450);
  put('prop_cf_hearth_trough',124,449);put('prop_cf_hearth_scarecrow',140,432);
  put('prop_cf_hearth_trough',159,388);
  for(const [x,y] of [[161,395],[184,405],[153,418],[151,431],[129,441],[180,389]] as const)
    put('prop_cf_hearth_streetlamp',x,y);
  // A rock spring explains the brook's head below the northern escarpment.
  put('nature_cf_rock_04',137,362);put('nature_cf_rock_01',143,362);
  put('nature_cf_grass_02',138,363);put('nature_cf_grass_01',142,363);
  // Reeds and lily pads break up selected pond banks; the navigable bridge stays clear.
  for(const [x,y] of [[134,374],[143,373],[146,375],[137,383],[144,383],[138,365],[140,369]] as const) {
    if(cells[`${x},${y}`]?.surface==='water')put(x%2?'nature_cf_water_flower_01':'nature_cf_water_grass_01',x,y);
  }
  for(const [x,y] of [[132,373],[148,374],[132,384],[148,385],[134,387]] as const)
    put('tree_cf_oak_young',x,y);
  // Planted greens give the long residential lanes a human scale.
  for(const [x,y] of [[135,387],[145,388],[139,390],[143,414],[147,416],[140,420],
    [177,415],[175,411],[182,431],[178,435],[160,431],[152,367],[156,371],
    [191,380],[194,386],[122,397],[116,391]] as const) {
    if(clear(x,y))put((x+y)%3?'tree_cf_oak_young':'tree_cf_fruit_small',x,y);
  }
  for(const [x,y] of [[158,391],[172,390],[177,397],[181,397],[159,420],[172,422],[194,403]] as const)
    put('prop_cf_furniture_rustic_potted_fern',x,y);
  put('prop_cf_barrel_apples',168,398);put('prop_cf_barrel_apples',184,400);
  put('prop_cf_barrel_apples',148,452);
  // Paired flower borders and low fences frame the park without enclosing its paths.
  for(let x=137;x<=149;x++) {
    if(x!==142&&x!==143)put('prop_cf_fence_horizontal',x,422);
    if(x%2)put('prop_cf_flowers_pink',x,421);
  }
  put('prop_cf_hearth_bench',138,419);put('prop_cf_hearth_bench',147,419);
  for(const [x,y] of [[134,411],[137,413],[142,411],[147,413],[150,420],[175,409],[179,410],[183,409],
    [188,432],[190,435],[185,438],[164,434],[163,437],[154,369]] as const)
    put((x+y)%2?'prop_cf_flowers_gold':'prop_cf_flowers_pink',x,y);

  // Seeded rejection sampling has no underlying tree lattice. Broad ecological
  // patches give denser oak/birch groves, conifer hilltops and meadow clearings.
  let seed=0x57494c4c;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const groves=[[104,349,25,19],[164,350,27,17],[94,379,17,22],[96,418,17,24],
    [169,451,22,16],[204,365,13,20],[204,440,15,18]] as const;
  const trees:{x:number;y:number}[]=[];
  for(let attempt=0;attempt<26000&&trees.length<850;attempt++) {
    const x=76+Math.floor(random()*138),y=332+Math.floor(random()*138);
    const density=Math.max(...groves.map(([cx,cy,rx,ry])=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2))));
    if(random()>density*.88+.025||!clear(x,y,true))continue;
    const separation=1.8+random()*1.3;
    if(trees.some(t=>(t.x-x)**2+(t.y-y)**2<separation**2))continue;
    const elevated=(cells[`${x},${y}`]?.elevation??0)>0;
    const species=elevated&&random()<.45?3:random()<.6?0:random()<.75?1:2;
    const sapling=random()<.24;
    put(sapling?(species===1?'tree_cf_birch_sapling':species===2?'tree_cf_fruit_small':'tree_cf_oak_young'):HEARTH_SCENERY_ASSETS[species]!,x,y);trees.push({x,y});
  }
  for(let attempt=0;attempt<900;attempt++) {
    const x=79+Math.floor(random()*132),y=335+Math.floor(random()*129);
    const cell=cells[`${x},${y}`];
    if(cell?.biome!=='meadow'||cell.feature||occupied.has(`${x},${y}`))continue;
    if(WILLOWHARBOUR_PLOTS.some(p=>x>=p.minX-1&&x<=p.maxX+1&&y>=p.minY-1&&y<=p.maxY+2))continue;
    if(!trees.some(t=>(t.x-x)**2+(t.y-y)**2<50))continue;
    const name=random()<.65?'nature_cf_grass_01':random()<.4?'nature_cf_grass_02':random()<.5?'prop_cf_flowers_pink':random()<.6?'nature_cf_rock_01':'prop_cf_poi_stump';
    if(name==='nature_cf_rock_01'||name==='prop_cf_poi_stump') {if(!clear(x,y))continue;}
    put(name,x,y);
  }
  return { prefabs,objects };
}
