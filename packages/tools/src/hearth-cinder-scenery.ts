import type {HearthBuildingAsset,MapObjectInstance,MapPrefabCell,MapPrefabDocumentV2} from '@orchard/sim';

export const HEARTH_CINDER_SCENERY_ASSETS=[
  'prop_cf_cinder_blossom_small','prop_cf_cinder_blossom_large','prop_cf_cinder_violet_plant',
  'prop_cf_cinder_column_cluster','prop_cf_cinder_broad_pillar','building_cf_cinder_tower',
] as const;
type SceneryAsset=typeof HEARTH_CINDER_SCENERY_ASSETS[number];
/** Horizontal opaque bounds across the last six native rows. Depth is a
 * conservative physical foundation, not the entire tall sprite silhouette. */
export const HEARTH_CINDER_NATIVE_BASES={
  prop_cf_cinder_column_cluster:{left:2,right:25,depth:16},
  prop_cf_cinder_broad_pillar:{left:3,right:28,depth:16},
  building_cf_cinder_tower:{left:3,right:92,depth:32},
} as const;
const prefabId=(name:string)=>`hearth-cinder-${name.replace(/_/g,'-')}`;
export const HEARTH_CINDER_SCENERY_PLACEMENTS:readonly {
  readonly id:string;readonly asset:SceneryAsset;readonly x:number;readonly y:number;readonly elevation:number;
}[]=[
  ...[[662,192],[669,192],[668,203],[668,211]].map(([x,y],index)=>({
    id:`boundary-${index}`,asset:'prop_cf_cinder_broad_pillar' as const,x:x!,y:y!,elevation:0})),
  ...[[672,216],[688,216],[696,202],[730,218]].flatMap(([x,y],index)=>[
    {id:`shore-rock-${index}`,asset:'prop_cf_cinder_column_cluster' as const,x:x!,y:y!,elevation:0},
    {id:`shore-flower-${index}`,asset:'prop_cf_cinder_violet_plant' as const,x:x!+2,y:y!+1,elevation:0},
  ]),
  {id:'shore-tree-west',asset:'prop_cf_cinder_blossom_small',x:676,y:220,elevation:0},
  {id:'shore-tree-east',asset:'prop_cf_cinder_blossom_large',x:694,y:218,elevation:0},
  {id:'caldera-tower',asset:'building_cf_cinder_tower',x:721,y:100,elevation:3},
];

export const HEARTH_CINDER_LANDING_PLACEMENTS=[
  {id:'ferry-boat',asset:'vehicle_cf_boat',x:640,y:211},
  {id:'ferry-sign',asset:'prop_cf_hearth_harbour_sign',x:646,y:205},
  {id:'supply-cache',asset:'prop_cf_chest',x:650,y:202},
  {id:'cargo-west',asset:'prop_cf_barrel',x:648,y:201},
  {id:'cargo-east',asset:'prop_cf_barrel',x:652,y:201},
  {id:'rest-bench-west',asset:'prop_cf_camp_bench',x:655,y:204},
  {id:'rest-bench-east',asset:'prop_cf_camp_bench',x:656,y:204},
] as const;

export function buildHearthCinderScenery(assetFor:(name:string)=>HearthBuildingAsset,
  assetRegistryRevision:string):{readonly prefabs:readonly MapPrefabDocumentV2[];readonly objects:readonly MapObjectInstance[]}{
  const prefabs=HEARTH_CINDER_SCENERY_ASSETS.map((name):MapPrefabDocumentV2=>{
    const asset=assetFor(name),pivot={tileX:Math.floor(asset.anchor[0]/16),tileY:Math.floor(asset.anchor[1]/16)};
    const tree=name.includes('blossom'),cells:MapPrefabCell[]=[];
    if(tree)cells.push({id:'trunk',...pivot,elevation:0,collisionMask:0x0660});
    else if(Object.prototype.hasOwnProperty.call(HEARTH_CINDER_NATIVE_BASES,name)){
      const base=HEARTH_CINDER_NATIVE_BASES[name as keyof typeof HEARTH_CINDER_NATIVE_BASES];
      const left=pivot.tileX*16+8-asset.anchor[0]+base.left;
      const right=pivot.tileX*16+8-asset.anchor[0]+base.right;
      const bottom=(pivot.tileY+1)*16,masks=new Map<string,MapPrefabCell>();
      for(let sy=Math.floor((bottom-base.depth)/4);sy<bottom/4;sy++)for(let sx=Math.floor(left/4);sx<=Math.floor(right/4);sx++){
        const tileX=Math.floor(sx/4),tileY=Math.floor(sy/4),key=`${tileX},${tileY}`;
        const cell=masks.get(key)??{id:`base-${tileX}-${tileY}`,tileX,tileY,elevation:0,collisionMask:0};
        masks.set(key,{...cell,collisionMask:cell.collisionMask|(1<<((sy%4)*4+sx%4))});
      }
      cells.push(...masks.values());
    }
    return {schemaVersion:2,kind:'map_prefab',id:prefabId(name),title:name,
      width:Math.max(Math.ceil(asset.width/16),...cells.map(cell=>cell.tileX+1)),height:Math.ceil(asset.height/16),tileSize:16,
      pivot,revision:1,assetRegistryRevision,tags:['hearth.cinderwake','authored.scenery'],
      collection:{id:'hearth-cinderwake',label:'Cinderwake',color:'#776a79'},behaviors:[{kind:'static'}],cells,
      placements:[{id:'visual',assetId:asset.id,assetName:name,...pivot,elevation:0,
        visual:{kind:'state',name:'base',frameIndex:0},layer:tree?'canopy':'object',quarterTurns:0,flipX:false}]};
  });
  const objects=HEARTH_CINDER_SCENERY_PLACEMENTS.map((row):MapObjectInstance=>({
    id:`hearth-cinder-${row.id}`,prefabId:prefabId(row.asset),prefabRevision:1,tileX:row.x,tileY:row.y,
    elevation:row.elevation,layer:'objects',quarterTurns:0,flipX:false,enabled:true,
  }));
  for(const row of HEARTH_CINDER_LANDING_PLACEMENTS)objects.push({
    id:`hearth-cinder-${row.id}`,prefabId:`hearth-${row.asset.replaceAll('_','-')}`,prefabRevision:1,
    tileX:row.x,tileY:row.y,elevation:0,layer:'objects',quarterTurns:0,flipX:false,enabled:true,
  });
  return {prefabs,objects};
}
