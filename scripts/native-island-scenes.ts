import { createEmptyMapDocument, migrateMapDocumentV2, type MapDocumentV3 } from '../packages/sim/src/index.js';

export interface NativePlacement {
  id: string; asset: string; x: number; y: number;
  frame?: number; crop?: [number, number, number, number];
  layer: 'ground' | 'wall' | 'object'; material?: 'lava' | 'stone' | 'water';
  role?: 'terrain' | 'cliff' | 'lava' | 'basin' | 'lavafall' | 'masonry' | 'clutter' | 'foliage' | 'water';
}
export interface NativeIslandScene {
  id: string; title: string; document: MapDocumentV3; placements: NativePlacement[];
  intendedTerraces: { level: number; polygon: number[][] }[];
  views: { id: string; x: number; y: number; width: number; height: number }[];
  review?: { falls: {x:number;y:number;left:number;width:number}[]; basinCells: string[]; cliffCells: string[]; roadCells: string[] };
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

/** Torn masonry is exposed buried paving, separate from engineered road curbs. */
export function cinderUncoveredPavingFrame(n:boolean,e:boolean,s:boolean,w:boolean,nw=true,ne=true,se=true,sw=true):number {
  let col=20,row=7;
  if(!n&&!w){col=18;row=6;}else if(!n&&!e){col=19;row=6;}
  else if(!s&&!w){col=18;row=7;}else if(!s&&!e){col=19;row=7;}
  else if(!n){col=16;row=8;}else if(!s){col=16;row=6;}
  else if(!e){col=15;row=7;}else if(!w){col=17;row=7;}
  else if(!se){col=15;row=6;}else if(!sw){col=17;row=6;}
  else if(!ne){col=15;row=8;}else if(!nw){col=17;row=8;}
  return row*29+col;
}

export function cinderCurbFrame(n:boolean,e:boolean,s:boolean,w:boolean):number|null {
  if(n&&w)return 104;if(n&&e)return 105;if(s&&w)return 133;if(s&&e)return 134;
  if(s)return 102;if(n)return 160;if(e)return 130;if(w)return 132;
  return null;
}

export function cinderHeatedAshFrame(n:boolean,e:boolean,s:boolean,w:boolean,nw=true,ne=true,se=true,sw=true):number {
  if(!n&&!w)return 7;if(!n&&!e)return 9;if(!s&&!w)return 65;if(!s&&!e)return 67;
  if(!n)return 8;if(!s)return 66;if(!e)return 38;if(!w)return 36;
  if(!se)return 94;if(!sw)return 95;if(!ne)return 123;if(!nw)return 124;
  return 37;
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
  const add = (asset: string, x: number, y: number, layer: NativePlacement['layer'], crop?: NativePlacement['crop'], material?: NativePlacement['material'],role?:NativePlacement['role']) => p.push({ id: `cinder-${String(p.length).padStart(6,'0')}`, asset, x, y, layer, ...(crop ? { crop } : {}), ...(material ? { material } : {}),role:role??(layer==='wall'?'cliff':layer==='object'?'foliage':'terrain') });
  const tile = (x: number, y: number, col: number, row: number, layer: NativePlacement['layer'] = 'ground', material: NativePlacement['material'] = 'stone',role?:NativePlacement['role']) => add('source:volcano-tiles', x * 16, y * 16, layer, [col * 16, row * 16, 16, 16], material,role);
  // The flat ash-edge bank is not coastal rock. Use full ash tops and basalt
  // cap/side/front courses; surf is composed outside the complete visual footprint.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (at(x, y)) {
    tile(x, y, 2, rand() < .12 ? 3 : 1);
    document.cells[`${x},${y}`] = { biome: 'volcanic_ash' };
  }
  const coastalFootprint = new Set<string>();
  const occupy=(x:number,y:number)=>coastalFootprint.add(`${x},${y}`);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(at(x,y)){
    occupy(x,y);
    if(!at(x,y-1))tile(x,y,12,0,'wall');
  }
  // Each front face is a three-row native column; irregular ledges replace circular rings.
  const faces: { x: number; y: number; level: number }[] = [];
  // All exposed fronts, including recessed coves, need faces. A lowest-y-only
  // scan misses concave coast segments and leaves flat ash hanging over water.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(at(x,y)&&!at(x,y+1)){
    // End columns 11/13 are mostly transparent seams. Replacing a complete
    // exposed tile with those strips leaves rectangular holes in the coast.
    const col=12;
    tile(x,y,col,1,'wall');
    for(let dy=1;dy<=3&&!at(x,y+dy);dy++){tile(x,y+dy,col,dy+1,'wall');occupy(x,y+dy);}
    faces.push({x,y,level:0});
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
    tile(x,y,col,row,'ground','lava','lava');
    // Sparse native floating crust, not prop pillars masquerading as a river.
    if (col===8 && row===7 && rand()<.11) tile(x,y,12+Math.floor(rand()*3),6+Math.floor(rand()*3),'ground','lava','lava');
    if (col===8 && row===7 && rand()<.05)p.push({id:`cinder-${String(p.length).padStart(6,'0')}`,asset:'tile_cf_volcano_design_bubbles',frame:4,x:x*16,y:y*16,layer:'ground',material:'lava',role:'lava'});
  }
  const road = [[16,79],[16,72],[25,72],[25,64],[43,64],[43,57],[83,57],[83,49],[46,49],[46,42],[56,42],[56,35]];
  const roadAt=(x:number,y:number)=>onLine(road,x,y,1.5);
  const roadCells=new Set<string>();
  const pave=(x:number,y:number)=>roadCells.add(`${x},${y}`);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(roadAt(x,y)&&at(x,y))pave(x,y);
  for(let y=27;y<=36;y++)for(let x=47;x<=60;x++)pave(x,y);
  for(let y=77;y<=81;y++)for(let x=12;x<=20;x++)pave(x,y);
  // A connected three-tile quay; all deck rows exist, rather than repeating
  // the empty centre of the bridge's bottom row as a detached ladder.
  for(let y=81;y<=85;y++)for(let x=14;x<=16;x++)pave(x,y);
  const paved=(x:number,y:number)=>roadCells.has(`${x},${y}`);
  for(const cell of roadCells){
    const [x,y]=cell.split(',').map(Number) as [number,number];
    const frame=223;
    tile(x,y,frame%29,Math.floor(frame/29),'object','stone','masonry');
  }
  const curbCells:string[]=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(at(x,y)&&!paved(x,y)&&!lava(x,y)){
    let frame=cinderCurbFrame(paved(x,y-1),paved(x+1,y),paved(x,y+1),paved(x-1,y));
    if(frame===null){if(paved(x+1,y+1))frame=101;else if(paved(x-1,y+1))frame=103;else if(paved(x+1,y-1))frame=159;else if(paved(x-1,y-1))frame=161;}
    if(frame===null||p.some(item=>item.role==='cliff'&&item.x===x*16&&item.y===y*16))continue;
    tile(x,y,frame%29,Math.floor(frame/29),'object','stone','masonry');curbCells.push(`${x},${y}`);
  }
  for(const cell of curbCells)roadCells.add(cell);
  // Bridges are derived from real crossings of the connected route. Each
  // native end overlaps a masonry landing; unrelated floating spans are gone.
  for(let i=1;i<road.length;i++){
    const a=road[i-1]!,b=road[i]!;if(a[1]!==b[1])continue;
    const y=a[1]!,end=Math.max(a[0]!,b[0]!);
    for(let x=Math.min(a[0]!,b[0]!);x<=end;x++)if(lava(x,y)){
      const left=x-1;while(x<=end&&lava(x,y))x++;const right=x;
      for(let bx=left;bx<=right;bx++)for(let dy=0;dy<3;dy++)
        add('source:volcano-bridge',bx*16,(y+dy-1)*16,'object',[(bx===left?4:bx===right?6:5)*16,dy*16,16,16],'stone','masonry');
    }
  }
  // Each staircase uses all six rows of the native stone stair bank and is
  // placed where a vertical route actually crosses a visible front.
  const stairHeads=new Set<string>();
  const stairs:{x:number;y:number}[]=[];
  for(let i=1;i<road.length;i++){
    const a=road[i-1]!,b=road[i]!;if(a[0]!==b[0])continue;
    const cx=a[0]!,lo=Math.min(a[1]!,b[1]!),hi=Math.max(a[1]!,b[1]!);
    for(const face of faces)if(face.x===cx&&face.y>=lo&&face.y<=hi&&!lava(cx,face.y)){
      const key=`${cx},${face.y}`;if(stairHeads.has(key))continue;stairHeads.add(key);
      if(stairs.some(stair=>stair.x===cx&&Math.abs(stair.y-face.y)<6))continue;
      stairs.push({x:cx,y:face.y});
      for(let dy=0;dy<6;dy++)for(let dx=0;dx<3;dx++){
        tile(cx+dx-1,face.y+dy-1,26+dx,dy,'object','stone','masonry');pave(cx+dx-1,face.y+dy-1);
      }
    }
  }
  for(let dy=0;dy<5;dy++)for(let dx=0;dx<3;dx++)
    add('source:volcano-bridge',(14+dx)*16,(81+dy)*16,'object',[dx*16,(dy===0?0:dy===4?3:1)*16,16,16],'stone','masonry');
  add('building_cf_cinder_tower',54*16,31*16,'object',undefined,'stone','masonry');
  add('prop_oak_barrel',13*16,79*16,'object',undefined,'stone','masonry');
  add('prop_oak_barrel',19*16,79*16,'object',undefined,'stone','masonry');

  // Compose complete native 3x5 spill poses: intake, all three wall-body rows,
  // and orange landing. Flat lava is below cliffs; only these deliberate
  // outlets cut a flowing opening through a structural face.
  const falls:{x:number;y:number;left:number;width:number}[]=[],fallCells=new Set<string>();
  for(let level=0;level<=6;level++)for(const side of ['west','east']){
    const candidates=faces.filter(f=>f.level===level&&(side==='west'?f.x<53:f.x>=53)&&lava(f.x,f.y)&&lava(f.x,f.y-1));
    const mean=candidates.reduce((sum,f)=>sum+f.x,0)/Math.max(1,candidates.length);
    candidates.sort((a,b)=>Math.abs(a.x-mean)-Math.abs(b.x-mean));
    for(const f of candidates){
      const channel:number[]=[];
      for(let dx=-6;dx<=6;dx++)if(lava(f.x+dx,f.y))channel.push(f.x+dx);
      const left=Math.min(...channel),right=Math.max(...channel),width=Math.max(3,right-left+1);
      if(falls.some(old=>left<old.left+old.width+1&&right>old.left-1&&Math.abs(old.y-f.y)<6))continue;
      let blocked=false;
      for(let dy=0;dy<5;dy++)for(let dx=0;dx<width;dx++)if(paved(left+dx,f.y+dy))blocked=true;
      if(blocked)continue;
      falls.push({x:f.x,y:f.y,left,width});
      for(let dy=0;dy<5;dy++)for(let dx=0;dx<width;dx++){
        const sourceColumn=dx===0?0:dx===width-1?2:1;
        add('source:volcano-lavafall',(left+dx)*16,(f.y+dy)*16,'wall',[sourceColumn*16,dy*16,16,16],'lava','lavafall');
        fallCells.add(`${left+dx},${f.y+dy}`);
        occupy(left+dx,f.y+dy);
      }
      break;
    }
  }
  // A spill lands in a lower receiving pool, rather than a rectangular footer
  // clipped by the next ledge. Shape the native banks around the union of the
  // pool and its downstream channel; preserve the vertical spill itself.
  const basinCells=new Set<string>();
  const basinAt=(x:number,y:number)=>basinCells.has(`${x},${y}`);
  const basin=(x:number,y:number)=>{if(at(x,y)&&!paved(x,y)){basinCells.add(`${x},${y}`);occupy(x,y);}};
  for(const fall of falls){
    const cx=fall.left+(fall.width-1)/2,cy=fall.y+4.8,rx=fall.width/2+1.1;
    for(let y=fall.y+4;y<=fall.y+6;y++)for(let x=fall.left-2;x<=fall.left+fall.width+1;x++)
      if((x-cx)**2/rx**2+(y-cy)**2/2.2**2<1)basin(x,y);
    const downstream=Array.from({length:17},(_,i)=>Math.round(cx)+i-8)
      .filter(x=>lava(x,fall.y+7)&&!paved(x,fall.y+7)).sort((a,b)=>Math.abs(a-cx)-Math.abs(b-cx))[0];
    if(downstream!==undefined)for(let y=fall.y+5;y<=fall.y+7;y++)for(let x=fall.left-3;x<=fall.left+fall.width+3;x++)
      if(distanceToLine(x,y,[cx,fall.y+5],[downstream,fall.y+7])<1.4)basin(x,y);
  }
  const receivingLava=(x:number,y:number)=>basinAt(x,y)||lava(x,y);
  for(const cell of basinCells){
    const [x,y]=cell.split(',').map(Number) as [number,number];
    const col=!receivingLava(x-1,y)?7:!receivingLava(x+1,y)?9:8;
    const row=!receivingLava(x,y-1)?6:!receivingLava(x,y+1)?8:7;
    tile(x,y,col,row,'ground','lava','basin');
  }
  const cliffCells=new Set(p.filter(item=>item.role==='cliff').map(item=>`${item.x/16},${item.y/16}`));
  const moltenCells=new Set(p.filter(item=>item.material==='lava').map(item=>`${item.x/16},${item.y/16}`));
  const hotCells=new Set(moltenCells);
  for(const cell of moltenCells){const [x,y]=cell.split(',').map(Number) as [number,number];
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(dx*dx+dy*dy<=5&&at(x+dx,y+dy)&&!paved(x+dx,y+dy)&&!cliffCells.has(`${x+dx},${y+dy}`))hotCells.add(`${x+dx},${y+dy}`);
  }
  const hot=(x:number,y:number)=>hotCells.has(`${x},${y}`);
  for(const cell of hotCells)if(!moltenCells.has(cell)){
    const [x,y]=cell.split(',').map(Number) as [number,number];
    const frame=cinderHeatedAshFrame(hot(x,y-1),hot(x+1,y),hot(x,y+1),hot(x-1,y),hot(x-1,y-1),hot(x+1,y-1),hot(x+1,y+1),hot(x-1,y+1));
    tile(x,y,frame%29,Math.floor(frame/29),'ground','stone','clutter');
  }
  const occupied=new Set<string>();
  const clear=(x:number,y:number)=>at(x,y)&&!hotCells.has(`${x},${y}`)&&!paved(x,y)&&!cliffCells.has(`${x},${y}`)&&!fallCells.has(`${x},${y}`)&&!occupied.has(`${x},${y}`);
  const cellsForSprite=(x:number,y:number,w:number,h:number,ax:number,ay:number)=>{
    const cells:string[]=[];
    const left=x*16+8-ax,top=y*16+16-ay;
    for(let cy=Math.floor(top/16);cy<=Math.floor((top+h-1)/16);cy++)for(let cx=Math.floor(left/16);cx<=Math.floor((left+w-1)/16);cx++)cells.push(`${cx},${cy}`);
    return cells;
  };
  const placePlant=(asset:string,x:number,y:number)=>{
    const dimensions=asset==='prop_cf_cinder_blossom_large'?[48,48,22,41]:asset==='prop_cf_cinder_blossom_small'?[32,48,16,41]:asset==='prop_cf_cinder_column_cluster'?[32,32,9,29]:asset==='prop_cf_cinder_detail_hot_columns'?[48,32,24,31]:asset.includes('shrub')?[16,32,8,31]:[16,16,8,15];
    const cells=cellsForSprite(x,y,...dimensions as [number,number,number,number]);
    if(!cells.every(cell=>{const [cx,cy]=cell.split(',').map(Number) as [number,number];return clear(cx,cy);}))return false;
    add(asset,x*16,y*16,'object',undefined,'stone','foliage');cells.forEach(cell=>occupied.add(cell));
    return true;
  };
  const clusters=[[21,27],[30,19],[78,24],[83,42],[19,54],[50,55],[69,67],[49,74],[25,76],[76,77],[63,38],[32,34],[43,16],[64,13],[67,75],[33,77]];
  // Reserve room for complete fire-tree silhouettes before small undergrowth
  // fills those ledges; original 32/48px crowns and roots are never resized.
  for(const [cx,cy] of clusters){let trees=0;for(let i=0;i<24&&trees<2;i++){
    const x=Math.round(cx!+(rand()-.5)*14),y=Math.round(cy!+(rand()-.5)*12);
    if(placePlant(rand()<.5?'prop_cf_cinder_blossom_large':'prop_cf_cinder_blossom_small',x,y))trees++;
  }}
  for(const [cx,cy] of clusters)for(let i=0;i<60;i++){
    const x=Math.round(cx!+(rand()-.5)*14),y=Math.round(cy!+(rand()-.5)*12),choice=rand();
    if(choice<.28)placePlant(rand()<.5?'prop_cf_cinder_blossom_large':'prop_cf_cinder_blossom_small',x,y);
    else if(choice<.43)placePlant(`prop_cf_cinder_detail_dead_shrub_${1+Math.floor(rand()*4)}`,x,y);
    else if(choice<.72)placePlant(`prop_cf_cinder_detail_ember_${1+Math.floor(rand()*5)}`,x,y);
    else if(choice<.87)placePlant(`prop_cf_cinder_detail_blue_crystal_${1+Math.floor(rand()*3)}`,x,y);
    else if(choice<.97)placePlant(`prop_cf_cinder_detail_hot_shrub_${1+Math.floor(rand()*4)}`,x,y);
    else placePlant('prop_cf_cinder_column_cluster',x,y);
  }
  // Whole 3x3 cracked-ground patches retain their connected source topology.
  // Detail paints before the cliff structure and is never scattered over faces.
  for(let i=0;i<100;i++){
    const x=Math.floor(rand()*width),y=Math.floor(rand()*height);
    const cells=Array.from({length:9},(_,j)=>[x+j%3,y+Math.floor(j/3)] as const);
    if(!cells.every(([cx,cy])=>clear(cx,cy)))continue;
    for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++)tile(x+dx,y+dy,4+dx,dy,'ground','stone','clutter');
    cells.forEach(([cx,cy])=>occupied.add(`${cx},${cy}`));
  }
  // Old paving revealed through ash belongs in occasional isolated patches.
  for(const [x,y]of [[26,28],[52,55],[71,70],[41,75]] as const){
    const cells=Array.from({length:9},(_,j)=>[x+j%3,y+Math.floor(j/3)] as const);
    if(!cells.every(([cx,cy])=>clear(cx,cy)))continue;
    for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){
      const frame=cinderUncoveredPavingFrame(dy>0,dx<2,dy<2,dx>0);
      tile(x+dx,y+dy,frame%29,Math.floor(frame/29),'ground','stone','clutter');
    }
  }
  // Native basalt courses make offshore islets. The previous little burning
  // rock props were not sea stacks and had no water contact at all.
  for(const [cx,cy,w] of [[8,28,2],[12,16,2],[32,6,2],[76,7,2],[94,31,2],[98,60,2],[92,79,2],[73,87,3],[30,87,2],[5,63,2]] as const){
    for(let dx=0;dx<w;dx++){
      tile(cx+dx,cy,12,0,'wall');occupy(cx+dx,cy);
      tile(cx+dx,cy+1,2,1,'wall');occupy(cx+dx,cy+1);
      for(let dy=2;dy<=4;dy++){tile(cx+dx,cy+dy,12,dy===2?1:dy===4?4:2,'wall');occupy(cx+dx,cy+dy);}
    }
  }
  // First temporal pose of the real 3x3 foam ring. Choose the edge that faces
  // adjacent basalt; never stamp the centre wave over the shore itself.
  for(const cell of roadCells)coastalFootprint.add(cell);
  const solid=(x:number,y:number)=>coastalFootprint.has(`${x},${y}`);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!solid(x,y)){
    const n=solid(x,y-1),e=solid(x+1,y),s=solid(x,y+1),w=solid(x-1,y);
    let col=-1,row=-1;
    if(s&&e){col=0;row=0;}else if(s&&w){col=2;row=0;}
    else if(n&&e){col=0;row=2;}else if(n&&w){col=2;row=2;}
    else if(s){col=1;row=0;}else if(n){col=1;row=2;}
    else if(e){col=0;row=1;}else if(w){col=2;row=1;}
    else if(solid(x+1,y+1)){col=0;row=0;}else if(solid(x-1,y+1)){col=2;row=0;}
    else if(solid(x+1,y-1)){col=0;row=2;}else if(solid(x-1,y-1)){col=2;row=2;}
    if(col>=0)p.push({id:`cinder-${String(p.length).padStart(6,'0')}`,asset:'tile_cf_cinder_coast_foam',frame:row*20+col,x:x*16,y:y*16,layer:'ground',material:'water'});
    else if(rand()<.12)add(rand()<.6?'nature_cf_ocean_surface_01':'nature_cf_ocean_surface_02',x*16,y*16,'ground',undefined,'water');
  }
  const phase:Record<NonNullable<NativePlacement['role']>,number>={terrain:0,clutter:0,lava:1,basin:1,cliff:2,lavafall:3,masonry:4,foliage:5,water:6};
  const frontCells=new Set(faces.flatMap(f=>Array.from({length:4},(_,dy)=>`${f.x},${f.y+dy}`)));
  // A thin back/side join is not a vertical lava drop. Keep actual front faces
  // and their full falls, but do not leave detached cap strips in molten pools.
  const visible=p.filter(item=>{
    const x=item.x/16,y=item.y/16;
    // Pool outlines own these cells, including any previous floating crust.
    if(basinAt(x,y)&&(item.role==='cliff'||item.role==='lava'))return false;
    if(item.role==='cliff'&&moltenCells.has(`${x},${y}`)&&(!frontCells.has(`${x},${y}`)||item.crop?.[1]===0||item.crop?.[0]===11*16||item.crop?.[0]===13*16))return false;
    // Flat river pixels cannot continue down a vertical spill face. The full
    // native fall owns this channel span until its landing on the lower ledge.
    if(item.role==='lava'&&falls.some(f=>Math.abs(x-f.x)<=6&&y>f.y&&y<f.y+4))return false;
    return true;
  });
  const placements=registered(visible).sort((a,b)=>phase[a.role??'water']-phase[b.role??'water']).map((item,i)=>({...item,id:`cinder-${String(i).padStart(6,'0')}`}));
  return { id:'cinderwake', title:'Cinderwake — basalt terraces, lava and summit road',document,placements,review:{falls,basinCells:[...basinCells],cliffCells:[...cliffCells],roadCells:[...roadCells]},
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
