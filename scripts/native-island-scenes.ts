import { createEmptyMapDocument, migrateMapDocumentV2, type MapDocumentV3 } from '../packages/sim/src/index.js';

export interface NativePlacement {
  id: string; asset: string; x: number; y: number;
  frame?: number; crop?: [number, number, number, number];
  layer: 'ground' | 'wall' | 'object'; material?: 'lava' | 'stone' | 'water';
}
export interface NativeIslandScene {
  id: string; title: string; document: MapDocumentV3; placements: NativePlacement[];
  intendedTerraces: { level: number; polygon: number[][] }[];
  views: { id: string; x: number; y: number; width: number; height: number }[];
}
const inside = (polygon: number[][], x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a[1]! > y) !== (b[1]! > y) && x < (b[0]! - a[0]!) * (y - a[1]!) / (b[1]! - a[1]!) + a[0]!) hit = !hit;
  }
  return hit;
};
function random(seed: number) { let state = seed; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; }; }
function distanceToLine(x: number, y: number, a: number[], b: number[]) {
  const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
  const t = Math.max(0, Math.min(1, ((x - a[0]!) * dx + (y - a[1]!) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0]! - t * dx, y - a[1]! - t * dy);
}
const onLine = (points: number[][], x: number, y: number, radius: number) => points.slice(1).some((point, i) => distanceToLine(x, y, points[i]!, point) < radius);
function registered(placements: NativePlacement[]): NativePlacement[] {
  return placements.map(p => {
    if(!p.asset.startsWith('source:'))return p.asset.startsWith('tile_')?p:{...p,x:p.x+8,y:p.y+16};
    const bank=p.asset==='source:volcano-tiles'?['tile_cf_volcano_design_sheet',29]:p.asset==='source:volcano-bridge'?['tile_cf_volcano_design_bridge',8]:['tile_cf_volcanic_lavafall',54];
    if(!p.crop || p.crop[2]!==16 || p.crop[3]!==16)throw new Error('Unregistered native source crop');
    const {crop,...placement}=p;
    return {...placement,asset:bank[0] as string,frame:crop[1]/16*(bank[1] as number)+crop[0]/16};
  });
}
type DraftDocument=Omit<MapDocumentV3,'cells'> & {cells:Record<string,MapDocumentV3['cells'][string]>};
function base(id: string, width: number, height: number): DraftDocument {
  return { ...migrateMapDocumentV2(createEmptyMapDocument({ id, title: id, width, height })), baseBiome: 'water' };
}

export function cinderwakeDesign(): NativeIslandScene {
  const width = 104, height = 92, document = base('native-cinderwake-draft', width, height);
  const land = [[11,31],[18,22],[15,17],[28,13],[35,7],[48,9],[59,5],[73,12],[81,10],[90,22],[87,32],[96,40],[91,50],[97,61],[88,70],[87,79],[73,83],[63,79],[51,86],[40,81],[30,84],[22,77],[12,79],[8,67],[14,57],[6,50],[10,43]];
  const polygons = [
    [[13,31],[24,23],[23,18],[35,14],[48,16],[61,11],[75,18],[84,22],[82,32],[91,41],[86,50],[91,61],[80,66],[83,75],[69,78],[56,73],[44,79],[33,72],[21,75],[17,62],[23,54],[13,48]],
    [[23,31],[29,24],[40,25],[46,18],[59,20],[70,17],[77,27],[74,35],[84,42],[77,50],[81,61],[70,63],[64,68],[54,62],[43,69],[35,61],[28,63],[30,51],[22,47]],
    [[28,29],[39,30],[44,24],[57,25],[64,20],[73,28],[68,37],[75,44],[68,51],[72,57],[59,59],[50,54],[40,59],[32,51],[35,43],[27,39]],
    [[39,28],[47,25],[60,28],[67,25],[70,33],[64,42],[68,48],[59,52],[48,47],[39,51],[35,42],[41,36]],
    [[44,25],[55,23],[64,28],[61,35],[66,40],[60,45],[49,41],[44,45],[40,37]],
    [[47,23],[58,23],[62,29],[59,35],[49,36],[45,30]],
  ];
  const at = (x: number, y: number) => inside(land, x + .5, y + .5);
  const p: NativePlacement[] = [], rand = random(4101);
  const add = (asset: string, x: number, y: number, layer: NativePlacement['layer'], crop?: NativePlacement['crop'], material?: NativePlacement['material']) => p.push({ id: `cinder-${String(p.length).padStart(6,'0')}`, asset, x, y, layer, ...(crop ? { crop } : {}), ...(material ? { material } : {}) });
  const tile = (x: number, y: number, col: number, row: number, layer: NativePlacement['layer'] = 'ground', material: NativePlacement['material'] = 'stone') => add('source:volcano-tiles', x * 16, y * 16, layer, [col * 16, row * 16, 16, 16], material);
  // Manually composed native shoreline, cap and wall tiles, independent of cliff-tool grammar.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (at(x, y)) {
    const edgeX = !at(x - 1, y) ? 1 : !at(x + 1, y) ? 3 : 2;
    const edgeY = !at(x, y - 1) ? 6 : !at(x, y + 1) ? 8 : 7;
    tile(x, y, edgeX, edgeY);
    if (edgeY === 7 && edgeX === 2) tile(x, y, 2, rand() < .12 ? 3 : 1);
    document.cells[`${x},${y}`] = { biome: 'volcanic_ash' };
  }
  // Each front face is a three-row native column; irregular ledges replace circular rings.
  const faces: { x: number; y: number; level: number }[] = [];
  for(let x=0;x<width;x++){
    let y=height-1;while(y>=0&&!at(x,y))y--;if(y<0)continue;
    tile(x,y,12,1,'wall');tile(x,y+1,12,2,'wall');tile(x,y+2,12,4,'wall');
  }
  for (let level = 1; level <= 6; level++) {
    const polygon=polygons[level-1]!;
    const on=(x:number,y:number)=>inside(polygon,x+.5,y+.5);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(on(x,y)){
      if(!on(x,y-1))tile(x,y,!on(x-1,y)?11:!on(x+1,y)?13:12,0,'wall');
      else if(!on(x-1,y))tile(x,y,11,1,'wall');
      else if(!on(x+1,y))tile(x,y,13,1,'wall');
    }
    const front=(x:number)=>{for(let y=height-1;y>=0;y--)if(inside(polygon,x+.5,y+.5))return y;return -1;};
    for (let x = 0; x < width; x++) {
      const y=front(x);if(y<0)continue;
      const left = front(x-1)<0, right = front(x+1)<0;
      const col = left ? 11 : right ? 13 : 12;
      tile(x, y, col, 1, 'wall');
      for (let dy = 1; dy <= 3; dy++) tile(x, y + dy, col, dy + 1, 'wall');
      faces.push({ x, y, level });
    }
  }
  const lavaA = [[43,21],[38,29],[40,37],[33,43],[34,53],[29,62],[35,69],[39,79],[40,84]];
  const lavaB = [[65,22],[72,30],[66,39],[75,47],[79,57],[85,66],[86,78]];
  const lava = (x: number, y: number) => at(x,y) && (
    onLine(lavaA,x,y,1.65 + .6*Math.sin(y*.4)) || onLine(lavaB,x,y,2.15 + .5*Math.cos(y*.38))
    || ((x-52)**2/12**2+(y-19)**2/4**2 < 1)
    || ((x-21)**2/4**2+(y-48)**2/3**2 < 1)
    || ((x-62)**2/6**2+(y-61)**2/3**2 < 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (lava(x,y)) {
    const col = !lava(x-1,y) ? 7 : !lava(x+1,y) ? 9 : 8;
    const row = !lava(x,y-1) ? 6 : !lava(x,y+1) ? 8 : 7;
    tile(x,y,col,row,'wall','lava');
    // Sparse native floating crust, not prop pillars masquerading as a river.
    if (col===8 && row===7 && rand()<.11) tile(x,y,12+Math.floor(rand()*3),6+Math.floor(rand()*3),'wall','lava');
  }
  // Native fall strips at real visual drops; bottom impact pool belongs to the same flow.
  for(const face of faces) if(lava(face.x,face.y) && lava(face.x,face.y+3)) {
    for(let dy=1;dy<=3;dy++) add('source:volcano-lavafall',face.x*16,(face.y+dy)*16,'wall',[16,dy===3?48:16,16,16],'lava');
  }
  const road = [[16,79],[16,72],[25,72],[25,64],[43,64],[43,57],[67,57],[67,49],[46,49],[46,42],[56,42],[56,35]];
  const roadAt=(x:number,y:number)=>onLine(road,x,y,1.5);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(roadAt(x,y) && at(x,y))tile(x,y,19+(x+y)%2,6,'object');
  // Horizontal native stone bridges include their proper top/bottom parapets.
  for(const [cx,cy,length] of [[31,64,8],[73,57,9],[37,43,7]] as const) {
    for(let dx=0;dx<length;dx++)for(let dy=0;dy<3;dy++)add('source:volcano-bridge',(cx+dx)*16,(cy+dy-1)*16,'object',[(4+(dx===0?0:dx===length-1?2:1))*16,dy*16,16,16],'stone');
  }
  for(const [cx,cy] of [[25,70],[43,62],[67,55],[46,47],[56,40],[56,35]] as const) {
    for(let dy=0;dy<4;dy++)for(let dx=0;dx<3;dx++)tile(cx+dx-1,cy+dy-3,26+dx,dy===0?0:dy===3?5:1,'object');
  }
  // Summit forecourt and tower: true native sizes, never scaled stand-ins.
  for(let y=27;y<=36;y++)for(let x=47;x<=60;x++)tile(x,y,19+(x+y)%2,6,'object');
  add('building_cf_cinder_tower',54*16,31*16,'object');
  // Arrival quay built from the same native masonry and bridge set.
  for(let y=77;y<=81;y++)for(let x=12;x<=20;x++)tile(x,y,19+(x+y)%2,6,'object');
  for(let y=81;y<=85;y++)for(let x=14;x<=16;x++)add('source:volcano-bridge',x*16,y*16,'object',[(x-14)*16,48,16,16],'stone');
  add('prop_oak_barrel',13*16,79*16,'object');add('prop_oak_barrel',19*16,79*16,'object');
  const clear = (x:number,y:number) => at(x,y) && !lava(x,y) && !roadAt(x,y) && !(x>43&&x<64&&y>17&&y<37) && !faces.some(f=>Math.abs(f.x-x)<2&&y>=f.y-1&&y<f.y+4);
  const clusters=[[21,27],[30,19],[78,24],[83,42],[19,54],[50,55],[69,67],[49,74],[25,76],[76,77],[63,38],[32,34]];
  for(const [cx,cy] of clusters) {
    for(let i=0;i<22;i++) {
      const x=Math.round(cx!+(rand()-.5)*12),y=Math.round(cy!+(rand()-.5)*10);if(!clear(x,y))continue;
      const choice=rand();
      if(choice<.22)add(rand()<.5?'prop_cf_cinder_blossom_large':'prop_cf_cinder_blossom_small',x*16,y*16,'object');
      else if(choice<.36)add(`prop_cf_cinder_detail_dead_shrub_${1+Math.floor(rand()*4)}`,x*16,y*16,'object');
      else if(choice<.68)add(`prop_cf_cinder_detail_ember_${1+Math.floor(rand()*5)}`,x*16,y*16,'object');
      else if(choice<.84)add(`prop_cf_cinder_detail_blue_crystal_${1+Math.floor(rand()*3)}`,x*16,y*16,'object');
      else add(`prop_cf_cinder_detail_hot_shrub_${1+Math.floor(rand()*4)}`,x*16,y*16,'object');
    }
  }
  for(let i=0;i<190;i++) {const x=Math.floor(rand()*width),y=Math.floor(rand()*height);if(!clear(x,y))continue;
    if(rand()<.1)add('prop_cf_cinder_column_cluster',x*16,y*16,'object');
    else tile(x,y,4+Math.floor(rand()*6),Math.floor(rand()*5),'ground');
  }
  for(const [x,y] of [[7,70],[24,87],[58,88],[88,83],[96,71],[91,32],[13,18]] as const)
    add(`prop_cf_cinder_detail_broad_pillar_${1+Math.floor(rand()*3)}`,x*16,y*16,'object');
  return { id:'cinderwake', title:'Cinderwake — basalt terraces, lava and summit road',document,placements:registered(p),
    intendedTerraces:polygons.map((polygon,i)=>({level:i+1,polygon})),
    views:[{id:'summit',x:38*16,y:14*16,width:39*16,height:35*16},{id:'ascent',x:16*16,y:40*16,width:68*16,height:40*16}] };
}

export function willowharbourDesign(): NativeIslandScene {
  const width=144,height=116,document=base('native-willowharbour-draft',width,height),rand=random(7201),p:NativePlacement[]=[];
  const land=[[17,15],[31,10],[43,15],[53,10],[69,7],[79,13],[90,10],[107,15],[119,11],[125,21],[120,29],[124,39],[134,48],[128,56],[131,65],[124,75],[130,85],[125,96],[113,97],[105,90],[96,94],[93,104],[78,109],[65,104],[51,108],[43,101],[31,104],[23,96],[26,87],[31,82],[21,76],[12,78],[8,70],[12,59],[9,52],[13,43],[24,41],[33,48],[36,40],[30,33],[24,29],[14,27]];
  const isLand=(x:number,y:number)=>inside(land,x+.5,y+.5);
  const river=[[65,18],[65,31],[64,43],[66,54],[63,64],[65,75],[62,86],[64,100],[67,110]];
  const lake=(x:number,y:number)=>(x-64)**2/10**2+(y-17)**2/5**2<1;
  const riverAt=(x:number,y:number)=>onLine(river,x,y,2.2+.4*Math.sin(y*.25))||lake(x,y);
  const roads=[[[48,38],[48,59],[66,59],[98,59],[116,59],[134,59]],[[48,42],[80,42],[80,59]],[[95,42],[95,59]],[[48,80],[82,80],[105,80],[105,61]],[[82,59],[82,100],[49,100]],[[40,80],[40,72]],[[52,59],[52,42]]];
  const roadAt=(x:number,y:number)=>roads.some(line=>onLine(line,x,y,1.2));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(isLand(x,y)){
    let beach=false;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(!isLand(x+dx,y+dy))beach=true;
    document.cells[`${x},${y}`]={biome:riverAt(x,y)?'freshwater':beach?'beach':roadAt(x,y)?'paving':'plains',...(riverAt(x,y)?{surface:'water' as const}:{} )};
  }
  const add=(asset:string,x:number,y:number,layer:NativePlacement['layer']='object',frame=0)=>p.push({id:`willow-${String(p.length).padStart(6,'0')}`,asset,x:x*16,y:y*16,layer,frame});
  // Tall northern woodland shelves and rocky headlands, hand placed around the lake.
  for(let x=20;x<=117;x++) {
    const y=Math.round(28+3*Math.sin(x*.17));if(riverAt(x,y)||!isLand(x,y))continue;
    add('tile_cf_stone_cliff_variants',x,y,'wall',30);add('tile_cf_stone_cliff_variants',x,y+1,'wall',58);add('tile_cf_stone_cliff_variants',x,y+2,'wall',72);
  }
  for(const y of [42,59,80,100]) {
    const cx=y===42?65:y===59?66:y===80?64:64;
    for(let x=cx-5;x<=cx+5;x++) {
      add('prop_cf_hearth_bridge_middle_deck',x,y+2,'ground');
      add('prop_cf_hearth_bridge_middle_north',x,y,'object');
      add('prop_cf_hearth_bridge_middle_south',x,y+3,'object');
    }
  }
  const buildings=[
    ['building_cf_hearth_inn',49,39],['building_cf_hearth_orchard_cottage',98,39],['building_cf_hearth_guild',89,54],
    ['building_cf_hearth_general_store',76,59],['building_cf_hearth_smith',112,57],
    ['building_cf_hearth_garden_cottage',42,78],['building_cf_hearth_carpenter',91,78],['building_cf_hearth_furnisher',114,77],
    ['building_cf_hearth_barn',51,98],['building_cf_hearth_greenhouse',73,98],
  ] as const;
  for(const [asset,x,y] of buildings)add(asset,x,y);
  // Courtyards keep native hedge/fence/building identity rather than dense forest over the town.
  for(const [cx,cy,w] of [[49,39,9],[98,39,7],[89,54,14],[42,78,7]] as const) {
    for(let dx=-w/2;dx<=w/2;dx++)add('prop_cf_hearth_hedge_horizontal',cx+Math.round(dx),cy-8,'ground');
    for(let dy=-7;dy<=1;dy++){add('prop_cf_hearth_hedge_vertical',cx-Math.ceil(w/2),cy+dy,'ground');add('prop_cf_hearth_hedge_vertical',cx+Math.ceil(w/2),cy+dy,'ground');}
  }
  for(let y=53;y<=58;y++)for(let x=88;x<=104;x++)document.cells[`${x},${y}`]={biome:'paving'};
  for(const [x,y] of [[89,55],[97,55],[104,59]] as const)add('prop_cf_hearth_stall_red',x,y);
  add('prop_cf_hearth_stall_blue',101,55);add('prop_cf_hearth_bench',95,58);
  add('prop_cf_hearth_fountain',99,58);add('prop_cf_hearth_well',47,92);
  for(let y=93;y<=98;y++)for(let x=56;x<=60;x++)document.cells[`${x},${y}`]={biome:'plains',surface:'dirt',feature:'farmland'};
  for(let x=121;x<=138;x++){add('prop_cf_hearth_bridge_middle_deck',x,60,'ground');add('prop_cf_hearth_bridge_middle_north',x,58);add('prop_cf_hearth_bridge_middle_south',x,61);}
  for(const [cx,cy,w,h] of [[50,45,7,3],[69,84,5,9],[73,84,4,9],[43,84,5,5]] as const){
    for(let y=cy;y<cy+h;y++)for(let x=cx;x<cx+w;x++){
      document.cells[`${x},${y}`]={biome:'plains',surface:'dirt',feature:'farmland'};
      if((x+y)%2===0)add('crop_cf_carrot_mature',x,y,'ground');
    }
    for(let x=cx;x<cx+w;x++){add('prop_cf_fence_white_horizontal',x,cy-1);add('prop_cf_fence_white_horizontal',x,cy+h);}
  }
  for(const [x,y] of [[46,42],[50,59],[76,61],[86,59],[107,59],[119,59],[42,81],[83,81],[105,81],[53,100]] as const)add('prop_cf_hearth_streetlamp',x,y);
  const blocked=(x:number,y:number)=>roadAt(x,y)||riverAt(x,y)||buildings.some(([,bx,by])=>Math.abs(x-bx)<9&&y>by-10&&y<by+3)||x>85&&x<108&&y>49&&y<61;
  const treeAssets=['tree_cf_oak_mature','tree_cf_birch_mature','tree_cf_spruce_mature','tree_cf_oak_young'];
  for(let i=0;i<4200;i++) {
    const x=Math.floor(rand()*width),y=Math.floor(rand()*height);if(!isLand(x,y)||blocked(x,y))continue;
    const grove=[[48,68],[98,32],[111,89],[78,67]].some(([cx,cy])=>(x-cx!)**2/7**2+(y-cy!)**2/5**2<1);
    const woods=y<32||x<37||x>118||y>99||grove;
    if(woods&&rand()<.67)add(treeAssets[Math.floor(rand()*treeAssets.length)]!,x,y);
    else if(rand()<.22)add(`nature_cf_flower_grass_${String(1+Math.floor(rand()*15)).padStart(2,'0')}`,x,y,'ground');
    else if(rand()<.12)add(`nature_cf_rock_${String(1+Math.floor(rand()*13)).padStart(2,'0')}`,x,y);
  }
  // Rocks and small offshore teeth reinforce exposed headlands while leaving the coves open.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(isLand(x,y)&&(!isLand(x-1,y)||!isLand(x+1,y)||!isLand(x,y+1))&&rand()<.2&&!riverAt(x,y))add(`nature_cf_rock_${String(1+Math.floor(rand()*13)).padStart(2,'0')}`,x,y);
  return {id:'willowharbour',title:'Willowharbour — coves, headlands and woodland town',document,placements:registered(p),intendedTerraces:[],
    views:[{id:'town',x:36*16,y:32*16,width:90*16,height:55*16},{id:'western-coves',x:3*16,y:25*16,width:50*16,height:60*16}]};
}
