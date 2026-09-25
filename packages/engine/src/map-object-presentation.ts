/** Authored map-object presentation: sprite draws, point lights and light
 * occluders for placed prefab objects.
 *
 * Everything here reads plain object records (objects, the prefab revisions
 * they refer to, and the layer stack) rather than a whole map document, so the
 * same presentation can later be fed from chunk records. Terrain is sampled
 * through an injected sampler for the same reason.
 *
 * Import boundary: this module must not import the island generator, the map
 * compiler, the map document module, `terrain.ts` or `live-map-runtime.ts`,
 * and must not take values from the `@orchard/sim` barrel (which re-exports
 * the generator). `map-object-presentation.test.ts` enforces this. The
 * document-based API in `live-map-runtime.ts` is a thin adapter over this. */
import type {
  ContentRegistry,
  MapContentLayerDefinition,
  MapObjectInstance,
  MapPoint,
  MapPrefabDocumentV2,
  MapStampVisual,
  ObjectContentDefinition,
  ResolvedObjectAppearance,
  StateValues,
} from '@orchard/sim';
import { resolveObjectLight } from '@orchard/sim/behaviour/data-graph';
import { mapObjectConnectionMasks, type MapObjectConnectionRecords } from '@orchard/sim/connected-objects';
import { NATURAL_OBJECT_ASSET_ALIASES } from '@orchard/sim/content/natural-object';
import { resolveObjectDefinitionAppearance } from '@orchard/sim/content/object-archetype';
import { authoredMapContentPainterTie, mapObjectCollisionCells, mapObjectPrefab } from '@orchard/sim/map-object-records';
import { resolveObjectAppearance } from '@orchard/sim/object-presentation';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim/state';
import { streetlampState } from '@orchard/sim/streetlamp';
import { loadGeneratedAsset, selectAtlasFrame, type AssetFrameSource, type AtlasFrame, type LoadedAsset } from '@orchard/ui';
import { drawConnectedObject, preloadConnectedObjectArt } from './connected-objects.js';
import { groundSpriteSource } from './ground-light-source.js';
import { createFrameLightOccluder, type LightTrunkOccluder } from './light-occlusion.js';
import { placeablePointLight } from './light-sources.js';
import type { PointLight } from './lighting.js';
import { mapShadowContacts } from './map-shadow-contacts.js';
import { restoreSpriteTransform, saveSpriteTransform } from './painter-context.js';
import type { WorldDepthItem } from './renderer.js';
import { TransformedLightSpriteCache } from './transformed-light-sprite.js';
import { worldAssetFrameSource } from './world-asset-presentation.js';

/** The records map-object presentation reads. A whole `MapDocumentV3`
 * satisfies this structurally; chunk records can supply the same lists.
 * Retained caches (layer ranks, connection topology, shadow casters) are keyed
 * by the identity of this object, so pass the same object for one revision. */
export interface MapObjectRecords extends MapObjectConnectionRecords {
  /** Map id; scopes connected-object topology. */
  readonly id: string;
  /** Persisted layer stack; ranks the final painter tie-break. */
  readonly layers: readonly Pick<MapContentLayerDefinition, 'id' | 'order'>[];
  /** The prefab revisions the objects refer to. */
  readonly prefabs: readonly MapPrefabDocumentV2[];
  /** Authored object instances, in document order. */
  readonly objects: readonly MapObjectInstance[];
}

/** Terrain queries light occluders need. `TerrainArray` is sampled by the
 * adapter in `live-map-runtime.ts`; a chunk window can supply its own. */
export interface MapObjectTerrainSampler<Terrain> {
  readonly elevationAtWorldFoot: (terrain: Terrain, worldX: number, worldFootY: number) => number;
  readonly projectedDepthAtFoot: (terrain: Terrain, worldX: number, worldFootY: number) => number;
  readonly projectedElevationAtFoot: (terrain: Terrain, worldX: number, worldFootY: number) => number;
  readonly projectedSortOffset: (elevation: number) => number;
}

/** Any terrain whose revision is tracked by a version number. */
export interface MapObjectTerrain {
  readonly version: number;
}

const assets = new Map<string, LoadedAsset>();
const pendingAssets = new Map<string, Promise<void>>();
let assetReadinessRevision = 0;

/** Changes only when a native map sprite becomes available. Consumers that
 * retain alpha-derived lighting must include this in their invalidation key.
 * This is first-load readiness, not atlas hot-replacement tracking. Failed
 * requests retain the loader's existing page-reload recovery policy. */
export function mapObjectAssetReadinessRevision(): number {
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
export async function preloadMapObjectAssets(records: MapObjectRecords): Promise<void> {
  const assetNames = new Set<string>();
  for (const object of records.objects) {
    const prefab = mapObjectPrefab(records, object);
    if (prefab === null) continue;
    for (const placement of prefab.placements) assetNames.add(resolveObjectAppearance(placement,prefab.presentation,object.state).placement.assetName);
  }
  const families=new Set([...mapObjectConnectionMasks(records).values()].map(entry=>entry.family));
  await Promise.all([...assetNames].map(requestAsset).concat([...families].map(family=>preloadConnectedObjectArt(family).catch(()=>undefined))));
}

export function mapObjectAssetsReady(records: MapObjectRecords): boolean {
  for (const object of records.objects) {
    const prefab = mapObjectPrefab(records, object);
    if (prefab === null) continue;
    for (const placement of prefab.placements) {
      if (!assets.has(resolveObjectAppearance(placement,prefab.presentation,object.state).placement.assetName)) return false;
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

export interface MapObjectRenderOptions {
  readonly contentRegistry?: ContentRegistry;
  /** Full topology source when the caller culls visible objects. */
  readonly connectionDocument?: MapObjectConnectionRecords;
  /** Gameplay draws authoritative placeables; editor/offline previews use auto. */
  readonly materializedStreetlamps?: boolean;
  readonly calendarTick?: bigint;
  readonly context: CanvasRenderingContext2D;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly scale: number;
  readonly timeMs: number;
  readonly visible: (worldX: number, worldY: number) => boolean;
  readonly enqueue: (worldX: number, worldFootY: number, item: WorldDepthItem) => void;
}

export function enqueueMapObjects(
  records: MapObjectRecords | null,
  options: MapObjectRenderOptions,
): number {
  if (records === null) return 0;
  const connections = mapObjectConnectionMasks(options.connectionDocument ?? records);
  let count = 0;
  for (const object of records.objects) {
    if (!object.enabled) continue;
    const prefab = mapObjectPrefab(records, object);
    if (prefab === null) continue;
    for (const originalPlacement of prefab.placements) {
      const appearance=resolveObjectAppearance(originalPlacement,prefab.presentation,object.state);
      const placement=appearance.placement;
      const asset = loadedAsset(placement.assetName);
      if (asset === null) continue;
      const lamp=placement.assetName==='prop_cf_hearth_streetlamp';
      if(lamp&&options.materializedStreetlamps)continue;
      const visual=lamp?{...placement.visual,name:streetlampState('{}',options.calendarTick??0n).lit?'on':'base'}:placement.visual;
      const frame = visualFrame(asset, visual, options.timeMs);
      if (frame === null) continue;
      const delta = transformedDelta(placement.tileX, placement.tileY, prefab, object);
      const worldX = (object.tileX + delta.tileX) * 16 + 8;
      const worldFootY = (object.tileY + delta.tileY + 1) * 16;
      if (!options.visible(worldX, worldFootY)) continue;
      options.enqueue(worldX, worldFootY, {
        footY: worldFootY,
        depthPhase: object.layer === 'ground' ? 'surface' : 'entity',
        tie: authoredMapContentPainterTie(
          records, object.layer, 'object', object.id, placement.id,
        ),
        draw: () => {
          const connection = connections.get(object.id);
          if (connection && drawConnectedObject(options.context,connection.family,connection.mask,worldX,worldFootY,options.cameraX,options.cameraY,options.scale)) return;
          const screenX = Math.round((worldX - options.cameraX) * options.scale);
          const screenY = Math.round((worldFootY - options.cameraY) * options.scale);
          const savedTransform = saveSpriteTransform(options.context, true);
          options.context.translate(screenX, screenY);
          options.context.rotate(object.quarterTurns * Math.PI / 2);
          const objectScale = (object.scale ?? 1)*appearance.scalePermille/1000;
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
          const receivesGlobal = options.contentRegistry === undefined ? true
            : boundMapAppearance(options.contentRegistry, placement.assetName, placement.visual.name, object.state)?.appearance.lighting.receivesGlobal ?? true;
          const source = worldAssetFrameSource(options.context, asset, frame, receivesGlobal ? groundTransform : undefined, receivesGlobal)!;
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

/** Bind native map art to authored object semantics. Revisions own this cache;
 * animation choice is part of identity, so an unlit frame never borrows a lit
 * frame's emitter. Ambiguous matches remain unbound. */
interface BoundMapAppearance { readonly definition: ObjectContentDefinition; readonly appearance: ResolvedObjectAppearance; readonly state: StateValues }
const mapAppearanceBindings = new WeakMap<ContentRegistry, ReadonlyMap<string, BoundMapAppearance>>();
function boundMapAppearance(registry: ContentRegistry, assetName: string, visualName: string, state?: StateValues) {
  let bindings = mapAppearanceBindings.get(registry);
  if (bindings === undefined) {
    const candidates = new Map<string, BoundMapAppearance>();
    const ambiguous = new Set<string>();
    for (const definition of registry.objects.values()) {
      if (definition.retired === true) continue;
      const states = [definition.components.states?.lit?.type === 'bool' ? { lit: true } : {},
        ...(definition.components.overrides ?? []).map(o => o.when)];
      for (const [index, state] of states.entries()) {
        const appearance = resolveObjectDefinitionAppearance(definition, state);
        if (appearance.sprite === null) continue;
        const visual = index === 0 ? definition.components.sprite?.animationByState?.default ?? 'base' : appearance.sprite.animation;
        const assets = [appearance.sprite.asset, NATURAL_OBJECT_ASSET_ALIASES[appearance.sprite.asset]].filter((name): name is string => name !== undefined);
        for (const asset of assets) {
          const key = `${asset}/${visual}`;
          const previous = candidates.get(key);
          if (previous !== undefined && previous.definition.id !== definition.id
            && JSON.stringify(previous.appearance) !== JSON.stringify(appearance)) ambiguous.add(key);
          else if (previous === undefined) candidates.set(key, { definition, appearance, state });
        }
      }
    }
    for (const key of ambiguous) candidates.delete(key);
    bindings = candidates;
    mapAppearanceBindings.set(registry, bindings);
  }
  const binding = bindings.get(`${assetName}/${visualName}`) ?? null;
  if (binding === null || state === undefined) return binding;
  const declared = Object.fromEntries(Object.entries(state).filter(([key]) => binding.definition.components.states?.[key] !== undefined));
  return { ...binding, appearance: resolveObjectDefinitionAppearance(binding.definition, { ...binding.state, ...declared }) };
}
/** Lights follow the same loaded native placements as the map renderer. */
export interface MapObjectPointLight extends PointLight {readonly terrainContactX:number}
export function mapObjectPointLights(records:MapObjectRecords|null,registry:ContentRegistry,authorityTick:bigint,materializedStreetlamps=false):MapObjectPointLight[]{
  if(records===null)return [];
  const lights:MapObjectPointLight[]=[];
  for(const object of records.objects){
    if(!object.enabled)continue;
    const prefab=mapObjectPrefab(records,object);
    if(!prefab)continue;
    for(const originalPlacement of prefab.placements){
      const mapAppearance=resolveObjectAppearance(originalPlacement,prefab.presentation,object.state);
      const placement=mapAppearance.placement;
      const binding=boundMapAppearance(registry,placement.assetName,placement.visual.name,object.state);
      const component=binding?.appearance.light;
      if(!component)continue;
      const asset=loadedAsset(placement.assetName);
      if(!asset||!visualFrame(asset,placement.visual,0))continue;
      const lamp=placement.assetName==='prop_cf_hearth_streetlamp';
      if(lamp&&materializedStreetlamps)continue;
      const lit=!lamp||streetlampState('{}',authorityTick).lit;
      if(!lit)continue;
      const authored=resolveObjectLight(component,{lit});
      let seed=0n;
      for(const character of `${object.id}/${placement.id}`)seed=(seed*31n+BigInt(character.charCodeAt(0)))&0xffffffffffffffffn;
      const light=placeablePointLight({id:seed,kind:binding!.definition.id,tileX:0,tileY:0},authorityTick,authored);
      if(!light)continue;
      const delta=transformedDelta(placement.tileX,placement.tileY,prefab,object);
      const x=(object.tileX+delta.tileX)*16+8,y=(object.tileY+delta.tileY+1)*16;
      const rotate=(x:number,y:number,turns:number):readonly[number,number]=>turns===0?[x,y]:turns===1?[-y,x]:turns===2?[-x,-y]:[y,-x];
      const [px,py]=rotate(0,authored.offsetY??0,placement.quarterTurns);
      const scale=(object.scale??1)*mapAppearance.scalePermille/1000;
      const [dx,dy]=rotate(px*(object.flipX?-scale:scale),py*scale,object.quarterTurns);
      lights.push({...light,worldX:x+dx,worldY:y+dy,receiverDirectionWorldY:y,terrainContactX:x});
    }
  }
  return lights;
}

const mapShadowMaskCache=new TransformedLightSpriteCache();
interface RetainedMapShadows {
  readonly terrain:MapObjectTerrain;
  readonly terrainVersion:number;
  readonly sampler:MapObjectTerrainSampler<never>;
  readonly registry:ContentRegistry;
  readonly readiness:number;
  readonly objects:Map<MapObjectInstance,{readonly frameKey:string;readonly casters:readonly LightTrunkOccluder[]}>;
}
let retainedMapShadows=new WeakMap<MapObjectRecords,RetainedMapShadows>();


/** Release retained lighting data when switching to Basic or tearing down the world. */
export function clearMapObjectShadowCaches():void{
  mapShadowMaskCache.clear();
  retainedMapShadows=new WeakMap();
}

/** Collects every loaded authored visual, without viewport-anchor culling.
 * `timeMs` must match the visible animation clock when retaining this result. */
export function mapObjectLightOccluders<Terrain extends MapObjectTerrain>(records:MapObjectRecords|null,terrain:Terrain,sampler:MapObjectTerrainSampler<Terrain>,registry:ContentRegistry,timeMs:number):LightTrunkOccluder[]{
  if(!records)return [];
  let retained=retainedMapShadows.get(records);
  const readiness=mapObjectAssetReadinessRevision();
  if(!retained||retained.terrain!==terrain||retained.terrainVersion!==terrain.version
    ||retained.sampler!==sampler||retained.registry!==registry||retained.readiness!==readiness){
    retained={terrain,terrainVersion:terrain.version,sampler,registry,readiness,objects:new Map()};
    retainedMapShadows.set(records,retained);
  }
  const result:LightTrunkOccluder[]=[];
  for(const object of records.objects){
    if(!object.enabled||object.layer==='ground')continue;
    const prefab=mapObjectPrefab(records,object);
    if(!prefab)continue;
    const frameKey=prefab.placements.map(p=>resolveObjectAppearance(p,prefab.presentation,object.state).placement).filter(p=>p.visual.kind==='animation').map(p=>{
      const asset=loadedAsset(p.assetName),frame=asset?visualFrame(asset,p.visual,timeMs):null;
      return frame?`${frame.x},${frame.y},${frame.width},${frame.height}`:'missing';
    }).join(':');
    const previous=retained.objects.get(object);
    if(previous?.frameKey===frameKey){result.push(...previous.casters);continue;}
    const objectStart=result.length;
    const visuals=[];
    for(const originalPlacement of prefab.placements){
      const mapAppearance=resolveObjectAppearance(originalPlacement,prefab.presentation,object.state);
      const placement=mapAppearance.placement;
      if(placement.layer==='ground')continue;
      // Luminous bodies must not terminate their own light seed.
      const binding=boundMapAppearance(registry,placement.assetName,placement.visual.name,object.state);
      const appearance=binding?.appearance;
      const explicitLighting=binding?.definition.components.lighting!==undefined||binding?.definition.components.overrides?.some(o=>o.lighting!==undefined)===true;
      if(explicitLighting ? appearance?.lighting.castsShadow==='none'&&!appearance.lighting.occludesLight
        : appearance?.light != null && !appearance.lighting.occludesLight)continue;
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
        const [px,py]=rotate(placement.flipX?-x:x,y,placement.quarterTurns),scale=(object.scale??1)*mapAppearance.scalePermille/1000;
        return rotate(px*(object.flipX?-scale:scale),py*scale,object.quarterTurns);
      };
      const [a,b]=vector(1,0),[c,d]=vector(0,1);
      const mask=mapShadowMaskCache.transform(native,{a,b,c,d},x,y);
      const level=sampler.elevationAtWorldFoot(terrain,x,y);
      visuals.push({placement,appearance,explicitLighting,x,y,mask,level,tie:authoredMapContentPainterTie(records,object.layer,'object',object.id,placement.id)});
    }
    // Contact allocation uses physical terrain planes, just like visible art.
    const contacts=mapShadowContacts(mapObjectCollisionCells(records,object).map(cell=>({...cell,
      elevation:sampler.elevationAtWorldFoot(terrain,cell.tileX*16+8,(cell.tileY+1)*16)})),
    visuals.map(v=>({id:v.placement.id,tie:v.tie,footX:v.x,footY:v.y,elevation:v.level,left:v.mask.left,right:v.mask.left+v.mask.width})));
    for(const visual of visuals){
      const {x,y,mask,level,tie,placement}=visual;
      const contact=contacts.get(placement.id);
      const column=visual.appearance?.lighting.castsShadow==='column'&&contact?.rectangularBase!=null;
      const base=(column?contact!.rectangularBase:contact?.contact)??{left:x*FIXED_UNITS_PER_PIXEL,right:x*FIXED_UNITS_PER_PIXEL,top:y*FIXED_UNITS_PER_PIXEL,bottom:y*FIXED_UNITS_PER_PIXEL};
      const projection=sampler.projectedDepthAtFoot(terrain,x,y),sortElevation=sampler.projectedElevationAtFoot(terrain,x,y);
      result.push({footX:x,footY:y-projection,elevationLayer:level,
        receiver:{...mask,top:mask.top-projection,elevationLayer:level},
        obstacle:{...base,top:base.top-projection*FIXED_UNITS_PER_PIXEL,bottom:base.bottom-projection*FIXED_UNITS_PER_PIXEL},
        contactEnabled:contact!==undefined,receiverFacing:'south',shadowMode:visual.appearance?.lighting.castsShadow==='none'?'none':column?'column':'silhouette',
        occludesLocalLight:visual.explicitLighting?visual.appearance?.lighting.occludesLight??true:true,
        painterOrder:{footY:y-projection,depthOffset:sampler.projectedSortOffset(sortElevation),
          elevationLayer:Math.ceil(Math.max(0,sortElevation-.001)),depthPhase:'entity',tie}});
    }
    retained.objects.set(object,{frameKey,casters:result.slice(objectStart)});
  }
  return result;
}

/** Retained masks advance only when image availability or a selected animation
 * frame changes. The owning caller also keys record/terrain revisions. */
export function mapObjectLightFrameKey(records:MapObjectRecords|null,registry:ContentRegistry,timeMs:number):string{
  const parts=[String(mapObjectAssetReadinessRevision())];
  if(!records)return parts[0]!;
  for(const object of records.objects){
    if(!object.enabled||object.layer==='ground')continue;
    const prefab=mapObjectPrefab(records,object);
    if(!prefab)continue;
    for(const originalPlacement of prefab.placements){
      const mapAppearance=resolveObjectAppearance(originalPlacement,prefab.presentation,object.state);
      const placement=mapAppearance.placement;
      const binding=boundMapAppearance(registry,placement.assetName,placement.visual.name,object.state);
      const appearance=binding?.appearance;
      const explicitLighting=binding?.definition.components.lighting!==undefined||binding?.definition.components.overrides?.some(o=>o.lighting!==undefined)===true;
      if(placement.layer==='ground'||(explicitLighting ? appearance?.lighting.castsShadow==='none'&&!appearance.lighting.occludesLight
        : appearance?.light != null && !appearance.lighting.occludesLight))continue;
      const asset=loadedAsset(placement.assetName);
      if(!asset||placement.visual.kind!=='animation')continue;
      const frame=visualFrame(asset,placement.visual,timeMs);
      parts.push(frame?`${frame.x},${frame.y},${frame.width},${frame.height}`:'missing');
    }
  }
  return parts.join(':');
}
