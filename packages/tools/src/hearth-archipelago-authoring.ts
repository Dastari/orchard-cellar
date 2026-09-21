import {HEARTH_COMBAT_REGIONS,HEARTH_ISLANDS,LIVE_ISLAND_MAP_ID,mapDocumentUsesSurvivalIslandBase,
  SURVIVAL_WORLD_SEED,SURVIVAL_WORLD_VERSION,validateCombatRegions,
  type MapDocumentV3,type MapDocumentV3CellOverride,type MapPoint,type TerrainTransition} from '@orchard/sim';

export const HEARTH_ARCHIPELAGO_VERSION = 1 as const;

export const WILLOWHARBOUR_PLOTS = [
  { id: 'inn', minX: 155, minY: 373, maxX: 173, maxY: 389, enterable: true, door: { tileX: 165, tileY: 390 } },
  { id: 'general-store', minX: 184, minY: 389, maxX: 198, maxY: 401, enterable: true, door: { tileX: 191, tileY: 402 } },
  { id: 'carpenter', minX: 142, minY: 391, maxX: 155, maxY: 404, enterable: true, door: { tileX: 149, tileY: 405 } },
  { id: 'furnisher', minX: 158, minY: 408, maxX: 170, maxY: 421, enterable: true, door: { tileX: 164, tileY: 422 } },
  { id: 'smith', minX: 180, minY: 411, maxX: 193, maxY: 424, enterable: true, door: { tileX: 187, tileY: 425 } },
  { id: 'guild', minX: 174, minY: 366, maxX: 185, maxY: 381, enterable: true, door: { tileX: 179, tileY: 382 } },
  { id: 'garden-cottage', minX: 116, minY: 363, maxX: 130, maxY: 378, enterable: true, door: { tileX: 123, tileY: 379 } },
  { id: 'orchard-cottage', minX: 105, minY: 411, maxX: 119, maxY: 426, enterable: true, door: { tileX: 112, tileY: 427 } },
  { id: 'barn', minX: 108, minY: 440, maxX: 126, maxY: 453, enterable: true, door: { tileX: 117, tileY: 454 } },
  { id: 'greenhouse', minX: 136, minY: 442, maxX: 149, maxY: 453, enterable: true, door: { tileX: 142, tileY: 454 } },
] as const;

/** Offline-only coastline catalogs. Field order preserves export-manifest compatibility. */
export const HEARTH_AUTHORING_ISLANDS = {
  willowharbour: {
    name: HEARTH_ISLANDS.willowharbour.name,
    minX: HEARTH_ISLANDS.willowharbour.minX, minY: HEARTH_ISLANDS.willowharbour.minY,
    maxX: HEARTH_ISLANDS.willowharbour.maxX, maxY: HEARTH_ISLANDS.willowharbour.maxY,
    coast: [[83,355],[94,337],[112,329],[127,331],[140,341],[153,339],[168,331],
      [183,336],[194,348],[199,363],[207,376],[214,390],[215,408],[206,419],
      [207,428],[197,444],[183,455],[170,464],[153,470],[139,469],[128,462],
      [115,463],[102,465],[91,455],[82,441],[76,425],[77,409],[87,397],
      [89,389],[80,380],[76,369]],
    arrival: HEARTH_ISLANDS.willowharbour.arrival, ferry: HEARTH_ISLANDS.willowharbour.ferry,
  },
  cinderwake: {
    name: HEARTH_ISLANDS.cinderwake.name,
    minX: HEARTH_ISLANDS.cinderwake.minX, minY: HEARTH_ISLANDS.cinderwake.minY,
    maxX: HEARTH_ISLANDS.cinderwake.maxX, maxY: HEARTH_ISLANDS.cinderwake.maxY,
    coast: [[644,81],[671,64],[706,57],[736,71],[768,69],[789,97],[793,131],
      [781,156],[787,186],[764,214],[732,231],[703,226],[681,234],[655,215],
      [630,207],[615,177],[624,151],[616,125],[629,102]],
    arrival: HEARTH_ISLANDS.cinderwake.arrival, ferry: HEARTH_ISLANDS.cinderwake.ferry,
  },
} as const;

// Nested basalt shelves leave a low coastal circuit and a level guardian floor.
const CINDER_TERRACES = [
  [[644,111],[658,91],[689,78],[721,84],[753,78],[775,104],[770,133],
    [778,162],[762,177],[735,187],[714,180],[698,180],[682,190],[655,183],[640,160],[647,138]],
  [[663,112],[682,99],[707,94],[739,100],[760,110],[757,132],[762,145],
    [748,162],[722,156],[714,150],[698,150],[681,165],[665,153],[671,136]],
  [[692,111],[704,99],[728,97],[746,104],[749,125],[741,138],[714,138],
    [698,138],[687,129]],
] as const;

function insideCoast(x: number, y: number, polygon: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!; const b = polygon[j]!;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Catmull–Rom samples round authored headlands without random tile speckle. */
function roundedCoast(points: readonly (readonly [number,number])[]): readonly (readonly [number,number])[] {
  return points.flatMap((b,i)=>{
    const a=points[(i+points.length-1)%points.length]!,c=points[(i+1)%points.length]!,d=points[(i+2)%points.length]!;
    return Array.from({length:6},(_,step)=>{
      const t=step/6;
      const at=(axis:0|1)=>.5*((2*b[axis])+(-a[axis]+c[axis])*t+(2*a[axis]-5*b[axis]+4*c[axis]-d[axis])*t*t+(-a[axis]+3*b[axis]-3*c[axis]+d[axis])*t*t*t);
      return [at(0),at(1)] as const;
    });
  });
}
const WILLOW_COAST=roundedCoast(HEARTH_AUTHORING_ISLANDS.willowharbour.coast);
const WILLOW_SHELVES=[
  roundedCoast([[89,348],[110,337],[127,341],[142,350],[165,343],[182,350],[186,359],
    [169,363],[151,360],[140,361],[122,354],[107,363],[92,371],[86,361]]),
  roundedCoast([[99,345],[112,341],[124,345],[131,350],[121,350],[109,349],[99,354]]),
] as const;

/** Continuous town river; crossings are the only authored dry links between banks. */
export const WILLOW_RIVER_POINTS = [[140,360],[140,380],[137,396],[137,406],[132,419],[127,430],[129,440],[133,450],[133,475]] as const;
export function willowRiverCenter(y:number):number {
  const i=WILLOW_RIVER_POINTS.findIndex((p,index)=>index>0&&y<=p[1]);
  if(i<1)return WILLOW_RIVER_POINTS[i===0?0:WILLOW_RIVER_POINTS.length-1]![0];
  const a=WILLOW_RIVER_POINTS[i-1]!,b=WILLOW_RIVER_POINTS[i]!;
  return Math.round(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));
}
export const WILLOW_BRIDGES = [[134,146,378],[131,143,404],[121,134,429],[127,139,455]] as const;

function key(x: number, y: number): string { return `${x},${y}`; }

export interface HearthArchipelagoContribution {
  readonly cells: Readonly<Record<string, MapDocumentV3CellOverride>>;
  readonly transitions: readonly TerrainTransition[];
}

/** A bounded addition, never an input to the legacy island/resource generator. */
export function buildHearthArchipelagoContribution(): HearthArchipelagoContribution {
  const cells: Record<string, MapDocumentV3CellOverride> = {};
  const transitions: TerrainTransition[] = [];
  for (const [id, island] of Object.entries(HEARTH_AUTHORING_ISLANDS)) {
    for (let y = island.minY; y <= island.maxY; y += 1) {
      for (let x = island.minX; x <= island.maxX; x += 1) {
        const coast=id==='willowharbour'?WILLOW_COAST:island.coast;
        if (!insideCoast(x + 0.5, y + 0.5, coast)) continue;
        if (id === 'willowharbour') {
          // Deep southern/western coves open into sand; sheltered headlands have
          // narrow shingle. Distance samples include diagonals to avoid diamond rims.
          const beachWidth=y>438?5+2*Math.sin(x/11):x<96?3.5:1.5;
          const beach=Array.from({length:16},(_,i)=>i*Math.PI/8).some(angle=>
            !insideCoast(x+.5+Math.cos(angle)*beachWidth,y+.5+Math.sin(angle)*beachWidth,coast));
          const elevation=WILLOW_SHELVES.reduce((level,shelf,index)=>insideCoast(x+.5,y+.5,shelf)?index+1:level,0);
          cells[key(x,y)] = beach ? { biome: 'beach', surface: 'sand' }
            : { biome: 'meadow', surface: 'grass', ...(elevation?{elevation,cliffFamily:'stone_1'}:{}) };
        } else {
          const elevation = CINDER_TERRACES.reduce((level, coast, index) =>
            insideCoast(x + 0.5, y + 0.5, coast) ? index + 1 : level, 0);
          cells[key(x,y)] = { biome: 'volcanic_ash', surface: 'stone', cliffFamily: 'volcanic',
            ...(elevation === 0 ? {} : { elevation }) };
        }
      }
    }
  }
  // Broad woodland stair landings, connected through the meadow north of town.
  for(let x=146;x<=149;x++) {
    for(let y=354;y<=364;y++) cells[key(x,y)]={biome:'meadow',surface:'grass',...(y<360?{elevation:1,cliffFamily:'stone_1' as const}:{})};
    transitions.push({contourLevel:1,kind:'slope',direction:'up',lowerTileX:x,lowerTileY:360,upperTileX:x,upperTileY:359});
  }
  const road = (points: readonly MapPoint[], width: number, volcanic = false): void => {
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]!; const b = points[i]!;
      const steps = Math.max(Math.abs(b.tileX - a.tileX), Math.abs(b.tileY - a.tileY), 1);
      for (let step = 0; step <= steps; step += 1) {
        const x = Math.round(a.tileX + (b.tileX - a.tileX) * step / steps);
        const y = Math.round(a.tileY + (b.tileY - a.tileY) * step / steps);
        for (let dy = 0; dy < width; dy += 1) for (let dx = 0; dx < width; dx += 1) {
          const old = cells[key(x+dx,y+dy)];
          if (old === undefined) continue;
          cells[key(x+dx,y+dy)] = volcanic ? { ...old, surface: 'stone', biome: 'volcanic_ash' }
            : { surface: 'stone', biome: 'paving' };
        }
      }
    }
  };
  const point = (tileX: number, tileY: number): MapPoint => ({ tileX, tileY });
  road([point(209,400), point(200,400), point(200,404), point(176,404)], 3);
  road([point(207,398), point(207,400)], 2);
  road([point(176,405), point(129,405), point(129,379)], 2);
  road([point(123,379), point(123,382), point(129,382)], 2);
  road([point(130,379), point(153,379)], 2);
  // The pond crossing continues around the inn garden into the square; avoid a
  // dead-end pavement that asks visitors to cut across the lawn.
  road([point(153,379), point(153,394), point(163,394)], 2);
  road([point(165,390), point(165,394)], 2);
  road([point(191,402), point(183,402)], 2);
  road([point(149,405), point(165,405)], 2);
  road([point(164,422), point(155,422), point(155,405)], 2);
  road([point(187,425), point(197,425), point(197,404), point(183,404)], 2);
  road([point(179,382), point(179,394)], 2);
  road([point(175,385), point(179,385)], 2);
  road([point(112,427), point(112,430), point(153,430), point(153,423), point(155,423)], 2);
  road([point(117,454), point(130,454), point(130,430)], 2);
  road([point(142,454), point(153,454), point(153,430)], 2);
  for (let y = 394; y <= 406; y += 1) for (let x = 163; x <= 183; x += 1) {
    cells[key(x,y)] = { surface: 'stone', biome: 'paving' };
  }
  // Open inn terrace, timber yard and the furnisher's outdoor display apron.
  for (const [left,top,right,bottom] of [[158,390,173,392],[136,395,140,405],[171,418,175,424],[175,383,176,385],[194,402,196,404]] as const) {
    for(let y=top;y<=bottom;y++) for(let x=left;x<=right;x++) cells[key(x,y)]={ surface: 'stone', biome: 'paving' };
  }
  road([point(142,430),point(142,440)],2);
  road([point(127,447),point(130,447)],2);
  // Consistent public thresholds; private/agricultural doors retain their plain paths.
  for(const plot of WILLOWHARBOUR_PLOTS.filter(p=>p.enterable)) {
    for(let y=plot.door.tileY;y<=plot.door.tileY+1;y++) for(let x=plot.door.tileX-1;x<=plot.door.tileX+1;x++) {
      cells[key(x,y)]={surface:'stone',biome:'paving'};
    }
  }
  // Rural lanes retain their public-path biome but select native dirt rather
  // than municipal stone; transitions and collision remain the same network.
  for(const [position,cell] of Object.entries(cells)) {
    const [x,y]=position.split(',').map(Number);
    if(cell.biome==='paving'&&x!<155&&y!>=427)cells[position]={...cell,surface:'dirt'};
  }
  // Two cultivated beds with a broad grass aisle and headland by the greenhouse.
  for(const [left,right] of [[136,140],[144,148]] as const) {
    for(let y=433;y<=439;y++) for(let x=left;x<=right;x++) {
      cells[key(x,y)]={surface:'grass',biome:'meadow',feature:'farmland'};
    }
  }
  // Upper freshwater headwater lake and its narrow spillway share the cliff plane.
  // The buffered ellipse keeps shoreline corners away from the plateau edge.
  for(let y=343;y<=358;y++)for(let x=128;x<=148;x++){
    const distance=((x-138)/8)**2+((y-351)/5)**2;
    if(distance<=1.7)cells[key(x,y)]={biome:'meadow',surface:'grass',elevation:1,cliffFamily:'stone_1'};
  }
  // Two-cell shoreline steps avoid isolated water tips the native shore cannot join.
  const lakeRows=[[2,5],[1,6],[0,7],[0,7],[1,6]] as const;
  for(let row=0;row<lakeRows.length;row++){
    const [left,right]=lakeRows[row]!;
    for(let y=346+row*2;y<348+row*2;y++)for(let x=130+left*2;x<132+right*2;x++)
      cells[key(x,y)]={biome:'freshwater',surface:'water',elevation:1,cliffFamily:'stone_1'};
  }
  for(let y=355;y<=359;y++)for(let x=139;x<=141;x++)
    cells[key(x,y)]={biome:'freshwater',surface:'water',elevation:1,cliffFamily:'stone_1'};
  // The river cuts through the settlement to the sea. Public roads terminate at
  // its banks and reconnect on actual bridges, not invisible water causeways.
  for(let y=360;y<=475;y++) {
    const center=willowRiverCenter(y),half=3+Math.round(.5+.5*Math.sin(y/9));
    for(let x=center-half;x<=center+half;x++) if(cells[key(x,y)])
      cells[key(x,y)]={biome:y>=461?'water':'freshwater',surface:'water'};
  }
  for(const [left,right,north] of WILLOW_BRIDGES) {
    for(let x=left-2;x<=right+2;x++)for(let y=north+1;y<=north+2;y++)
      cells[key(x,y)]={biome:'paving',surface:y>425?'dirt':'stone'};
  }
  // Both banks connect to the bridges without crossing water outside the decks.
  road([point(124,382),point(124,405),point(131,405)],2);
  road([point(112,428),point(112,430),point(121,430)],2);
  road([point(134,430),point(157,430)],2);
  road([point(117,456),point(142,456)],2);
  // Cultivated village flower beds use the same native soil transitions as crops.
  for(const [left,top,right,bottom] of [[158,409,163,410],[177,385,180,386],[114,385,119,386],
    [181,431,187,432],[105,432,109,433],[168,427,172,428]])
    for(let y=top!;y<=bottom!;y++)for(let x=left!;x<=right!;x++)if(cells[key(x,y)]?.biome==='meadow')
      cells[key(x,y)]={...cells[key(x,y)],feature:'farmland'};
  // Sandy estuary banks connect the river outlet to the existing beach rather
  // than leaving rectangular meadow tiles exposed directly to ocean water.
  for(let y=458;y<=475;y++)for(let x=willowRiverCenter(y)-7;x<=willowRiverCenter(y)+7;x++) {
    const cell=cells[key(x,y)];
    if(cell&&cell.surface!=='water'&&cell.biome!=='paving'&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>cells[key(x+dx!,y+dy!)]?.surface==='water'))
      cells[key(x,y)]={biome:'beach',surface:'sand'};
  }
  // The quay extends past the coast with an explicit two-row walking surface.
  // The scenery rails bound its sides; ocean beyond the eastern tip remains blocked.
  for(let x=212;x<=219;x++) for(let y=400;y<=401;y++) {
    cells[key(x,y)]={surface:'stone',biome:'paving'};
  }
  // Two separated lava channels leave a broad central approach and arena.
  for (let y = 94; y <= 174; y += 1) {
    for (const center of [684 + Math.round(4 * Math.sin(y / 13)), 757 + Math.round(3 * Math.sin(y / 11))]) {
      for (let dx = 0; dx < 3; dx += 1) {
        const old = cells[key(center+dx,y)];
        if (old !== undefined) cells[key(center+dx,y)] = { ...old, biome: 'lava', surface: 'stone', collision: 'force_block', collisionReason: 'lava' };
      }
    }
  }
  road([point(644,207), point(652,211), point(664,190), point(704,184), point(704,122), point(721,117)], 4, true);
  // A deliberately built landing contrasts with the ash shore. Preserve the
  // existing free-return threshold and recovery point; extend only the short
  // quay beside the moored boat, leaving the seaward cells non-walkable.
  for (let y = 205; y <= 212; y++) for (let x = 644; x <= 657; x++) {
    cells[key(x,y)] = { biome: 'paving', surface: 'stone', cliffFamily: 'volcanic' };
  }
  for (let y = 209; y <= 212; y++) for (let x = 642; x <= 643; x++) {
    cells[key(x,y)] = { biome: 'paving', surface: 'stone', cliffFamily: 'volcanic' };
  }
  // Cache apron joins the public landing; keep its southern approach open.
  for (let y = 202; y <= 204; y++) for (let x = 649; x <= 652; x++) {
    cells[key(x,y)] = { biome: 'paving', surface: 'stone', cliffFamily: 'volcanic' };
  }
  // Two four-tile gate approaches end exactly on the safe side of the
  // installed policy boundary (north y192, east x669). Paving is wayfinding,
  // never the authority for protection; the rest of the landing stays safe.
  for (let y = 192; y <= 208; y++) for (let x = 664; x <= 667; x++) {
    cells[key(x,y)] = { biome: 'paving', surface: 'stone', cliffFamily: 'volcanic' };
  }
  for (let y = 205; y <= 208; y++) for (let x = 658; x <= 668; x++) {
    cells[key(x,y)] = { biome: 'paving', surface: 'stone', cliffFamily: 'volcanic' };
  }
  for (const [y, level] of [[180,1],[150,2],[138,3]] as const) {
    for (let x = 704; x < 708; x += 1) transitions.push({ contourLevel: level, kind: 'slope', direction: 'up',
      lowerTileX: x, lowerTileY: y, upperTileX: x, upperTileY: y - 1 });
  }
  return { cells, transitions };
}

export interface HearthMapComposition {
  readonly document: MapDocumentV3;
  /** Conflicts are preserved and must be surveyed/resolved before publishing ferries. */
  readonly conflictingCells: readonly string[];
}

export function composeHearthArchipelago(document: MapDocumentV3): HearthMapComposition {
  if (document.width !== 832 || document.height !== 832) throw new Error('hearth_requires_832_world');
  if (document.id !== LIVE_ISLAND_MAP_ID || !mapDocumentUsesSurvivalIslandBase(document)
    || document.provenance.generatorSeed !== SURVIVAL_WORLD_SEED
    || document.provenance.generatorVersion !== SURVIVAL_WORLD_VERSION) throw new Error('hearth_requires_pinned_live_island');
  const contribution = buildHearthArchipelagoContribution();
  const conflictingCells = Object.keys(contribution.cells).filter((cell) => {
    const old = document.cells[cell]; const next = contribution.cells[cell]!;
    return old !== undefined && (Object.keys(old).length !== Object.keys(next).length
      || Object.entries(next).some(([field, value]) => Reflect.get(old, field) !== value));
  });
  const regions = [...(document.combatRegions ?? [])];
  for (const region of HEARTH_COMBAT_REGIONS) {
    const existing=regions.find(row=>row.id===region.id);
    if(existing!==undefined && JSON.stringify(existing)!==JSON.stringify(region)) {
      // Preserve separately authored policy; conflicting danger is never silently installed.
      if(Object.entries(region).some(([key,value])=>Reflect.get(existing,key)!==value)) throw new Error(`hearth_region_conflict:${region.id}`);
    }
    if(existing===undefined)regions.push(region);
  }
  const regionErrors=validateCombatRegions(regions);
  if(regionErrors.length>0)throw new Error(regionErrors.join(';'));
  const transitionKey=(transition:TerrainTransition)=>[transition.contourLevel,transition.kind,transition.direction,
    transition.lowerTileX,transition.lowerTileY,transition.upperTileX,transition.upperTileY].join(':');
  const oldTransitions = new Set(document.transitions.map(transitionKey));
  return {
    document: { ...document, combatRegions: regions, cells: { ...contribution.cells, ...document.cells },
      transitions: [...document.transitions, ...contribution.transitions.filter((transition) => !oldTransitions.has(transitionKey(transition)))] },
    conflictingCells,
  };
}
