import {TransformedLightSpriteCache} from './transformed-light-sprite.js';
import {mapShadowContacts} from './map-shadow-contacts.js';
import {createFrameLightOccluder,type LightTrunkOccluder} from './light-occlusion.js';
import {FIXED_UNITS_PER_PIXEL} from '@orchard/sim';
import {terrainElevationAtWorldFoot,terrainProjectedDepthAtFoot,terrainProjectedElevationAtFoot,terrainProjectedSortOffset} from './terrain.js';
import {groundSpriteSource} from './ground-light-source.js';
import {placeablePointLight} from './light-sources.js';
import type {PointLight} from './lighting.js';
import { saveSpriteTransform, restoreSpriteTransform } from './painter-context.js';
import { worldAssetFrameSource } from './world-asset-presentation.js';
import {
  LIVE_ISLAND_MAP_ID,
  resolveObjectLight,
  MAP_PREFAB_COLLISION_RESOLUTION,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
  TILE_SIZE_FIXED,
  TOPSIDE_SPACE_ID,
  authoredMapContentPainterTie,
  activeSurvivalLandmarks,
  mapDocumentUsesSurvivalIslandBase,
  compileMapDocument,
  runtimeTilesetResolver,
  survivalTerrainPlaneCollisionBytes,
  survivalTerrainTransitions,
  mapObjectCollisionCells,
  mapLandmarkCollisionObstacle,
  mapObjectPrefab,
  parseMapDocumentV3,
  terrainDocumentForMapV3,
  type CollisionObstacle,
  type MapDocumentV3,
  type MapObjectInstance,
  type MapPoint,
  type ContentRegistry,
  type MovementMedium,
  type MapPrefabDocumentV2,
  type MapStampVisual,
} from '@orchard/sim';
import { terrainArrayForMapDocument } from './editor-terrain.js';
import { terrainForWorld } from './terrain.js';
import { loadGeneratedAsset, type LoadedAsset,type AssetFrameSource } from '@orchard/ui';
import type { WorldDepthItem } from './renderer.js';
import { selectAtlasFrame, type AtlasFrame } from '@orchard/ui';
import type { TerrainArray } from './terrain.js';

export interface LiveMapDocumentRow {
  readonly mapId: string;
  readonly revision: number;
  readonly contentHash: string;
  readonly documentJson: string;
}

interface CachedLiveIsland {
  readonly key: string;
  readonly document: MapDocumentV3 | null;
}

interface CachedLiveTerrain {
  readonly key: string;
  readonly terrain: TerrainArray | null;
}

let cached: CachedLiveIsland | null = null;
let cachedTerrain: CachedLiveTerrain | null = null;
const warnedRows = new Set<string>();

function validLiveIsland(document: MapDocumentV3): boolean {
  return document.id === LIVE_ISLAND_MAP_ID
    && document.width === SURVIVAL_WORLD_SIZE
    && document.height === SURVIVAL_WORLD_SIZE
    && mapDocumentUsesSurvivalIslandBase(document);
}

function transitionKey(transition: MapDocumentV3['transitions'][number]): string {
  return [
    transition.contourLevel,
    transition.kind,
    transition.direction,
    transition.lowerTileX,
    transition.lowerTileY,
    transition.upperTileX,
    transition.upperTileY,
  ].join(':');
}

/** The production island document is intentionally a sparse overlay. Until an
 * author changes terrain, its generated terrain is byte-for-byte the existing
 * world generator output and must not be recompiled across all 832x832 cells
 * during client startup. Landmarks, prefabs, objects and suppressions do not
 * affect the terrain arrays and therefore remain eligible for this path. */
export function liveIslandUsesGeneratedTerrain(document: MapDocumentV3): boolean {
  if (!mapDocumentUsesSurvivalIslandBase(document)
    || document.baseElevation !== 0
    || document.baseSurface !== 'grass'
    || document.defaultCliffFamily !== 'stone_1'
    || document.defaultSurfaceFamily !== 'grass_1'
    || Object.keys(document.cells).length !== 0
    || (document.stairRuns?.length ?? 0) !== 0) return false;
  const generated = survivalTerrainTransitions(
    document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED,
  );
  if (generated.length !== document.transitions.length) return false;
  const authoredKeys = new Set(document.transitions.map(transitionKey));
  return generated.every((transition) => authoredKeys.has(transitionKey(transition)));
}

function cacheFor(
  row: LiveMapDocumentRow | null,
  registry?: ContentRegistry,
): CachedLiveIsland | null {
  if (row === null || row.mapId !== LIVE_ISLAND_MAP_ID) return null;
  const key = `${row.revision}:${row.contentHash}:${registry?.contentHash ?? 'bootstrap'}`;
  if (cached?.key === key) return cached;
  try {
    const document = parseMapDocumentV3(
      row.documentJson,
      registry === undefined ? undefined : activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID),
    );
    if (!validLiveIsland(document)) throw new TypeError('live island dimensions or generated base are incompatible');
    cached = { key, document };
  } catch (error) {
    cached = { key, document: null };
    if (!warnedRows.has(key)) {
      warnedRows.add(key);
      console.warn('Ignoring incompatible live island map document', error);
    }
  }
  return cached;
}

export function liveIslandDocument(
  row: LiveMapDocumentRow | null,
  registry?: ContentRegistry,
): MapDocumentV3 | null {
  return cacheFor(row, registry)?.document ?? null;
}

export function liveIslandTerrain(
  row: LiveMapDocumentRow | null,
  registry?: ContentRegistry,
): TerrainArray | null {
  const source = cacheFor(row, registry);
  if (source?.document === null || source === null || row === null) return null;
  const key = `${source.key}:${registry?.contentHash ?? 'bootstrap'}`;
  if (cachedTerrain?.key === key) return cachedTerrain.terrain;
  try {
    const resolver = registry === undefined ? undefined : runtimeTilesetResolver(registry.tilesets);
    if (liveIslandUsesGeneratedTerrain(source.document)) {
      const seed = source.document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED;
      const generatorVersion = source.document.provenance.generatorVersion ?? SURVIVAL_WORLD_VERSION;
      const generated = terrainForWorld(seed, generatorVersion);
      cachedTerrain = {
        key,
        terrain: {
          ...generated,
          version: row.revision,
          defaultCliffFamily: source.document.defaultCliffFamily,
          defaultSurfaceFamily: source.document.defaultSurfaceFamily,
          terrainTransitions: source.document.transitions,
          terrainPlaneBlocked: survivalTerrainPlaneCollisionBytes(seed),
          ...(resolver === undefined ? {} : { tilesets: resolver }),
        },
      };
      return cachedTerrain.terrain;
    }
    const terrainDocument = terrainDocumentForMapV3(source.document);
    const terrain = terrainArrayForMapDocument(
      terrainDocument,
      compileMapDocument(terrainDocument, resolver),
      source.document,
    );
    cachedTerrain = {
      key,
      terrain: { ...terrain, spaceId: TOPSIDE_SPACE_ID, version: row.revision },
    };
  } catch (error) {
    cachedTerrain = { key, terrain: null };
    if (!warnedRows.has(key)) {
      warnedRows.add(key);
      console.warn('Ignoring incompatible live island terrain content', error);
    }
  }
  return cachedTerrain.terrain;
}

/** Convert every occupied 4x4 prefab sub-cell into the same fixed-point
 * collision rectangles used by prediction and server authority. */
export function liveMapObjectCollisionObstacles(
  document: MapDocumentV3 | null,
  medium: MovementMedium = 'ground',
  registry?: ContentRegistry,
): readonly CollisionObstacle[] {
  if (document === null) return [];
  const subCellSize = TILE_SIZE_FIXED / MAP_PREFAB_COLLISION_RESOLUTION;
  const obstacles: CollisionObstacle[] = [];
  for (const object of document.objects) {
    for (const cell of mapObjectCollisionCells(document, object)) {
      for (let bit = 0; bit < MAP_PREFAB_COLLISION_RESOLUTION ** 2; bit += 1) {
        if ((cell.collisionMask & (1 << bit)) === 0) continue;
        const column = bit % MAP_PREFAB_COLLISION_RESOLUTION;
        const row = Math.floor(bit / MAP_PREFAB_COLLISION_RESOLUTION);
        const left = cell.tileX * TILE_SIZE_FIXED + column * subCellSize;
        const top = cell.tileY * TILE_SIZE_FIXED + row * subCellSize;
        obstacles.push({
          left,
          top,
          right: left + subCellSize - 1,
          bottom: top + subCellSize - 1,
        });
      }
    }
  }
  for (const landmark of document.landmarks) {
    const obstacle = mapLandmarkCollisionObstacle(landmark, medium, registry);
    if (obstacle !== null) obstacles.push(obstacle);
  }
  return obstacles;
}

const assets = new Map<string, LoadedAsset>();
const pendingAssets = new Map<string, Promise<void>>();
let assetReadinessRevision = 0;

/** Changes only when a native map sprite becomes available. Consumers that
 * retain alpha-derived lighting must include this in their invalidation key.
 * This is first-load readiness, not atlas hot-replacement tracking. Failed
 * requests retain the loader's existing page-reload recovery policy. */
export function liveMapObjectAssetReadinessRevision(): number {
  return assetReadinessRevision;
}

function requestAsset(assetName: string): Promise<void> {
  const existing = pendingAssets.get(assetName);
  if (existing !== undefined) return existing;
  if (assets.has(assetName)) return Promise.resolve();
  const pending = loadGeneratedAsset(assetName, 'summer')
    .then((asset) => {
      assets.set(assetName, asset);
      assetReadinessRevision += 1;
    })
    .catch((error: unknown) => { console.warn(`Live map object asset failed: ${assetName}`, error); });
  pendingAssets.set(assetName, pending);
  return pending;
}

function loadedAsset(assetName: string): LoadedAsset | null {
  const existing = assets.get(assetName);
  if (existing !== undefined) return existing;
  void requestAsset(assetName);
  return null;
}

/** Resolves the generated sprite sheets referenced by a map before an
 * invalidation-driven editor render. Gameplay can keep using lazy lookup;
 * Studio awaits this promise and requests one repaint when the assets land. */
export async function preloadLiveMapObjectAssets(document: MapDocumentV3): Promise<void> {
  const assetNames = new Set<string>();
  for (const object of document.objects) {
    const prefab = mapObjectPrefab(document, object);
    if (prefab === null) continue;
    for (const placement of prefab.placements) assetNames.add(placement.assetName);
  }
  await Promise.all([...assetNames].map(requestAsset));
}

export function liveMapObjectAssetsReady(document: MapDocumentV3): boolean {
  for (const object of document.objects) {
    const prefab = mapObjectPrefab(document, object);
    if (prefab === null) continue;
    for (const placement of prefab.placements) {
      if (!assets.has(placement.assetName)) return false;
    }
  }
  return true;
}

function visualFrame(asset: LoadedAsset, visual: MapStampVisual, timeMs: number): AtlasFrame | null {
  if (visual.kind !== 'animation') return selectAtlasFrame(asset.metadata, visual.name, visual.frameIndex);
  const frames = asset.metadata.animations[visual.name] ?? [];
  if (frames.length === 0) return null;
  const fps = asset.metadata.animationMeta?.[visual.name]?.fps ?? 6;
  return frames[Math.floor(timeMs * fps / 1_000) % frames.length] ?? frames[0] ?? null;
}

function transformedDelta(
  tileX: number,
  tileY: number,
  prefab: MapPrefabDocumentV2,
  object: MapObjectInstance,
): MapPoint {
  let deltaX = tileX - prefab.pivot.tileX;
  const deltaY = tileY - prefab.pivot.tileY;
  if (object.flipX) deltaX = -deltaX;
  const transformed = object.quarterTurns === 0 ? { tileX: deltaX, tileY: deltaY }
    : object.quarterTurns === 1 ? { tileX: -deltaY, tileY: deltaX }
      : object.quarterTurns === 2 ? { tileX: -deltaX, tileY: -deltaY }
        : { tileX: deltaY, tileY: -deltaX };
  const objectScale = object.scale ?? 1;
  return { tileX: transformed.tileX * objectScale, tileY: transformed.tileY * objectScale };
}

export interface LiveMapObjectRenderOptions {
  readonly context: CanvasRenderingContext2D;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly scale: number;
  readonly timeMs: number;
  readonly visible: (worldX: number, worldY: number) => boolean;
  readonly enqueue: (worldX: number, worldFootY: number, item: WorldDepthItem) => void;
}

export function enqueueLiveMapObjects(
  document: MapDocumentV3 | null,
  options: LiveMapObjectRenderOptions,
): number {
  if (document === null) return 0;
  let count = 0;
  for (const object of document.objects) {
    if (!object.enabled) continue;
    const prefab = mapObjectPrefab(document, object);
    if (prefab === null) continue;
    for (const placement of prefab.placements) {
      const asset = loadedAsset(placement.assetName);
      if (asset === null) continue;
      const frame = visualFrame(asset, placement.visual, options.timeMs);
      if (frame === null) continue;
      const delta = transformedDelta(placement.tileX, placement.tileY, prefab, object);
      const worldX = (object.tileX + delta.tileX) * 16 + 8;
      const worldFootY = (object.tileY + delta.tileY + 1) * 16;
      if (!options.visible(worldX, worldFootY)) continue;
      options.enqueue(worldX, worldFootY, {
        footY: worldFootY,
        depthPhase: object.layer === 'ground' ? 'surface' : 'entity',
        tie: authoredMapContentPainterTie(
          document, object.layer, 'object', object.id, placement.id,
        ),
        draw: () => {
          const screenX = Math.round((worldX - options.cameraX) * options.scale);
          const screenY = Math.round((worldFootY - options.cameraY) * options.scale);
          const savedTransform = saveSpriteTransform(options.context, true);
          options.context.translate(screenX, screenY);
          options.context.rotate(object.quarterTurns * Math.PI / 2);
          const objectScale = object.scale ?? 1;
          options.context.scale(object.flipX ? -objectScale : objectScale, objectScale);
          options.context.rotate(placement.quarterTurns * Math.PI / 2);
          options.context.scale(placement.flipX ? -1 : 1, 1);
          let groundTransform:((source:AssetFrameSource)=>AssetFrameSource)|undefined;
          if(object.layer==='ground'){
            const vector=(x:number,y:number):readonly[number,number]=>{
              const rotate=(x:number,y:number,t:number):readonly[number,number]=>t===0?[x,y]:t===1?[-y,x]:t===2?[-x,-y]:[y,-x];
              const [px,py]=rotate(placement.flipX?-x:x,y,placement.quarterTurns);
              return rotate(px*(object.flipX?-objectScale:objectScale),py*objectScale,object.quarterTurns);
            };
            const [a,b]=vector(1,0),[c,d]=vector(0,1),[left,top]=vector(-asset.anchor[0],-asset.anchor[1]);
            groundTransform=original=>groundSpriteSource(options.context,original,worldX+left,worldFootY+top,{a,b,c,d});
          }
          const source = worldAssetFrameSource(options.context, asset, frame,groundTransform)!;
          options.context.drawImage(
            source.image,
            source.x,
            source.y,
            frame.width,
            frame.height,
            -asset.anchor[0] * options.scale,
            -asset.anchor[1] * options.scale,
            frame.width * options.scale,
            frame.height * options.scale,
          );
          restoreSpriteTransform(options.context, savedTransform);
        },
      });
      count += 1;
    }
  }
  return count;
}

/** Explicit native visual/component pairs: an unlit frame must not emit light. */
const MAP_LIGHT_VISUALS:Readonly<Record<string,{objectId:string;visual:string}>>={
  prop_cf_hearth_streetlamp:{objectId:'object:hearth_streetlamp',visual:'base'},
  prop_cf_standing_torch:{objectId:'object:standing_torch',visual:'burn'},
  prop_cf_furniture_rustic_standing_lamp:{objectId:'object:furniture_rustic_standing_lamp',visual:'base'},
  prop_cf_furniture_townhouse_floor_lamp:{objectId:'object:furniture_townhouse_floor_lamp',visual:'base'},
  prop_cf_furniture_townhouse_table_lamp:{objectId:'object:furniture_townhouse_table_lamp',visual:'base'},
};
function boundMapLightDefinition(registry:ContentRegistry,assetName:string,visualName:string){
  const binding=MAP_LIGHT_VISUALS[assetName];
  if(!binding||binding.visual!==visualName)return null;
  const definition=registry.objects.get(binding.objectId);
  if(!definition?.components.light||definition.retired===true||definition.components.sprite?.asset!==assetName)return null;
  const defaultVisual=definition.components.sprite.animationByState?.['default'];
  return defaultVisual===undefined||defaultVisual===binding.visual?definition:null;
}
/** Lights follow the same loaded native placements as the map renderer. */
export interface MapObjectPointLight extends PointLight {readonly terrainContactX:number}
export function liveMapObjectPointLights(document:MapDocumentV3|null,registry:ContentRegistry,authorityTick:bigint):MapObjectPointLight[]{
  if(document===null)return [];
  const lights:MapObjectPointLight[]=[];
  for(const object of document.objects){
    if(!object.enabled)continue;
    const prefab=mapObjectPrefab(document,object);
    if(!prefab)continue;
    for(const placement of prefab.placements){
      const binding=MAP_LIGHT_VISUALS[placement.assetName];
      if(!binding||placement.visual.name!==binding.visual)continue;
      const definition=boundMapLightDefinition(registry,placement.assetName,placement.visual.name),component=definition?.components.light;
      if(!component)continue;
      const asset=loadedAsset(placement.assetName);
      if(!asset||!visualFrame(asset,placement.visual,0))continue;
      const authored=resolveObjectLight(component,{lit:true});
      let seed=0n;
      for(const character of `${object.id}/${placement.id}`)seed=(seed*31n+BigInt(character.charCodeAt(0)))&0xffffffffffffffffn;
      const light=placeablePointLight({id:seed,kind:binding.objectId,tileX:0,tileY:0},authorityTick,authored);
      if(!light)continue;
      const delta=transformedDelta(placement.tileX,placement.tileY,prefab,object);
      const x=(object.tileX+delta.tileX)*16+8,y=(object.tileY+delta.tileY+1)*16;
      const rotate=(x:number,y:number,turns:number):readonly[number,number]=>turns===0?[x,y]:turns===1?[-y,x]:turns===2?[-x,-y]:[y,-x];
      const [px,py]=rotate(0,authored.offsetY??0,placement.quarterTurns);
      const scale=object.scale??1;
      const [dx,dy]=rotate(px*(object.flipX?-scale:scale),py*scale,object.quarterTurns);
      lights.push({...light,worldX:x+dx,worldY:y+dy,receiverDirectionWorldY:y,terrainContactX:x});
    }
  }
  return lights;
}

const mapShadowMaskCache=new TransformedLightSpriteCache();
interface RetainedMapShadows {
  readonly terrain:TerrainArray;
  readonly terrainVersion:number;
  readonly registry:ContentRegistry;
  readonly readiness:number;
  readonly objects:Map<MapObjectInstance,{readonly frameKey:string;readonly casters:readonly LightTrunkOccluder[]}>;
}
let retainedMapShadows=new WeakMap<MapDocumentV3,RetainedMapShadows>();


/** Release retained lighting data when switching to Basic or tearing down the world. */
export function clearLiveMapShadowCaches():void{
  mapShadowMaskCache.clear();
  retainedMapShadows=new WeakMap();
}

/** Collects every loaded authored visual, without viewport-anchor culling.
 * `timeMs` must match the visible animation clock when retaining this result. */
export function liveMapObjectLightOccluders(document:MapDocumentV3|null,terrain:TerrainArray,registry:ContentRegistry,timeMs:number):LightTrunkOccluder[]{
  if(!document)return [];
  let retained=retainedMapShadows.get(document);
  const readiness=liveMapObjectAssetReadinessRevision();
  if(!retained||retained.terrain!==terrain||retained.terrainVersion!==terrain.version
    ||retained.registry!==registry||retained.readiness!==readiness){
    retained={terrain,terrainVersion:terrain.version,registry,readiness,objects:new Map()};
    retainedMapShadows.set(document,retained);
  }
  const result:LightTrunkOccluder[]=[];
  for(const object of document.objects){
    if(!object.enabled||object.layer==='ground')continue;
    const prefab=mapObjectPrefab(document,object);
    if(!prefab)continue;
    const frameKey=prefab.placements.filter(p=>p.visual.kind==='animation').map(p=>{
      const asset=loadedAsset(p.assetName),frame=asset?visualFrame(asset,p.visual,timeMs):null;
      return frame?`${frame.x},${frame.y},${frame.width},${frame.height}`:'missing';
    }).join(':');
    const previous=retained.objects.get(object);
    if(previous?.frameKey===frameKey){result.push(...previous.casters);continue;}
    const objectStart=result.length;
    const visuals=[];
    for(const placement of prefab.placements){
      if(placement.layer==='ground')continue;
      // Luminous bodies must not terminate their own light seed.
      const emitter=boundMapLightDefinition(registry,placement.assetName,placement.visual.name);
      if(emitter?.components.collision?.occludesLight===false)continue;
      const asset=loadedAsset(placement.assetName);
      if(!asset)continue;
      const frame=visualFrame(asset,placement.visual,timeMs);
      if(!frame)continue;
      const native=createFrameLightOccluder(asset,frame,0,0);
      if(!native)continue;
      const delta=transformedDelta(placement.tileX,placement.tileY,prefab,object);
      const x=(object.tileX+delta.tileX)*16+8,y=(object.tileY+delta.tileY+1)*16;
      const rotate=(x:number,y:number,t:number):readonly[number,number]=>t===0?[x,y]:t===1?[-y,x]:t===2?[-x,-y]:[y,-x];
      const vector=(x:number,y:number):readonly[number,number]=>{
        const [px,py]=rotate(placement.flipX?-x:x,y,placement.quarterTurns),scale=object.scale??1;
        return rotate(px*(object.flipX?-scale:scale),py*scale,object.quarterTurns);
      };
      const [a,b]=vector(1,0),[c,d]=vector(0,1);
      const mask=mapShadowMaskCache.transform(native,{a,b,c,d},x,y);
      const level=terrainElevationAtWorldFoot(terrain,x,y);
      visuals.push({placement,x,y,mask,level,tie:authoredMapContentPainterTie(document,object.layer,'object',object.id,placement.id)});
    }
    // Contact allocation uses physical terrain planes, just like visible art.
    const contacts=mapShadowContacts(mapObjectCollisionCells(document,object).map(cell=>({...cell,
      elevation:terrainElevationAtWorldFoot(terrain,cell.tileX*16+8,(cell.tileY+1)*16)})),
    visuals.map(v=>({id:v.placement.id,tie:v.tie,footX:v.x,footY:v.y,elevation:v.level,left:v.mask.left,right:v.mask.left+v.mask.width})));
    for(const visual of visuals){
      const {x,y,mask,level,tie,placement}=visual;
      const contact=contacts.get(placement.id);
      const column=placement.assetName.startsWith('tree_')&&contact?.rectangularBase!=null;
      const base=(column?contact!.rectangularBase:contact?.contact)??{left:x*FIXED_UNITS_PER_PIXEL,right:x*FIXED_UNITS_PER_PIXEL,top:y*FIXED_UNITS_PER_PIXEL,bottom:y*FIXED_UNITS_PER_PIXEL};
      const projection=terrainProjectedDepthAtFoot(terrain,x,y),sortElevation=terrainProjectedElevationAtFoot(terrain,x,y);
      result.push({footX:x,footY:y-projection,elevationLayer:level,
        receiver:{...mask,top:mask.top-projection,elevationLayer:level},
        obstacle:{...base,top:base.top-projection*FIXED_UNITS_PER_PIXEL,bottom:base.bottom-projection*FIXED_UNITS_PER_PIXEL},
        contactEnabled:contact!==undefined,receiverFacing:'south',shadowMode:column?'column':'silhouette',
        painterOrder:{footY:y-projection,depthOffset:terrainProjectedSortOffset(sortElevation),
          elevationLayer:Math.ceil(Math.max(0,sortElevation-.001)),depthPhase:'entity',tie}});
    }
    retained.objects.set(object,{frameKey,casters:result.slice(objectStart)});
  }
  return result;
}

/** Retained masks advance only when image availability or a selected animation
 * frame changes. The owning caller also keys document/terrain revisions. */
export function liveMapObjectLightFrameKey(document:MapDocumentV3|null,registry:ContentRegistry,timeMs:number):string{
  const parts=[String(liveMapObjectAssetReadinessRevision())];
  if(!document)return parts[0]!;
  for(const object of document.objects){
    if(!object.enabled||object.layer==='ground')continue;
    const prefab=mapObjectPrefab(document,object);
    if(!prefab)continue;
    for(const placement of prefab.placements){
      if(placement.layer==='ground'||boundMapLightDefinition(registry,placement.assetName,placement.visual.name)?.components.collision?.occludesLight===false)continue;
      const asset=loadedAsset(placement.assetName);
      if(!asset||placement.visual.kind!=='animation')continue;
      const frame=visualFrame(asset,placement.visual,timeMs);
      parts.push(frame?`${frame.x},${frame.y},${frame.width},${frame.height}`:'missing');
    }
  }
  return parts.join(':');
}
