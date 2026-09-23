import {hearthDoorwayFeatures} from './hearth-doorway.js';
import {residenceWallAt} from './residence-wall.js';
import { groundLightSource } from './ground-light-source.js';
import { worldAssetFrameSource, worldAssetPresentationKey, inheritWorldAssetPresentation } from './world-asset-presentation.js';
import {
  caveFloorAutotilePlan,
  hearthLobbyFloorTheme,
  caveFloorDecorationFrameAt,
  caveFloorPatchVariantAt,
  SURVIVAL_CHUNK_TILES,
  TERRAIN_SURFACE_FAMILIES,
  TERRAIN_CLIFF_FAMILIES,
  type TerrainCliffFamily,
  TILE_SIZE_PIXELS,
  surfaceFamilyAtIndex,
  type SurvivalBiome,
} from "@orchard/sim";
import type { OverworldArt } from "./overworld-art.js";
import type { LoadedAsset } from '@orchard/ui';
import { selectAtlasFrame, snapRectForContext } from '@orchard/ui';
import {
  beachFrameIndexAt,
  authoredFarmlandFrameIndexAt,
  desertGrassEdgeFrameIndexAt,
  desertGrassInsetFrameIndicesAt,
  desertShoreFrameIndexAt,
  grassSandTransitionFrameIndexAt,
  pavingGrassTransitionFrameIndexAt,
  savannaGrassTransitionFrameIndexAt,
  shorelineInsetFrameIndicesAt,
  dirtTerraceFrameIndexAt,
  dirtTerraceRampFrameIndexAt,
  freshwaterFrameIndexAt,
  freshwaterInsetFrameIndicesAt,
  terrainDecorationHash,
  terrainElevationAt,
  terrainCliffFamilyAt,
  terrainBiomeAt,
  terrainColorAt,
  terrainProjectionStyle, terrainVisualProjectionRowsPerLevel, terrainBaseDatum,
  waterDecorationAllowedAt,
  waterfallFrameIndexAt,
  waterfallUsesRaisedCompositionAt,
  type TerrainArray,
} from "./terrain.js";

export const GROUND_CHUNK_PIXELS = SURVIVAL_CHUNK_TILES * TILE_SIZE_PIXELS;

export function groundTileInsideTerrain(
  terrain: Pick<TerrainArray, "width" | "height">,
  tileX: number,
  tileY: number,
): boolean {
  return (
    tileX >= 0 && tileY >= 0 && tileX < terrain.width && tileY < terrain.height
  );
}

export class ChunkLruCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private capacityValue = 64) {}

  get size(): number {
    return this.entries.size;
  }
  get capacity(): number {
    return this.capacityValue;
  }
  has(chunkX: number, chunkY: number): boolean {
    return this.entries.has(`${chunkX},${chunkY}`);
  }

  setCapacity(capacity: number): void {
    this.capacityValue = Math.max(1, Math.ceil(capacity));
    this.evict();
  }

  getOrCreate(chunkX: number, chunkY: number, create: () => T): T {
    const key = `${chunkX},${chunkY}`;
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      // Map iteration order is the LRU queue: refresh a hit at the tail in O(1).
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }
    const value = create();
    this.entries.set(key, value);
    this.evict();
    return value;
  }

  invalidate(chunkX: number, chunkY: number): void {
    this.entries.delete(`${chunkX},${chunkY}`);
  }

  invalidateResource(tileX: number, tileY: number): void {
    this.invalidate(
      Math.floor(tileX / SURVIVAL_CHUNK_TILES),
      Math.floor(tileY / SURVIVAL_CHUNK_TILES),
    );
  }

  clear(): void {
    this.entries.clear();
  }

  keys(): readonly string[] {
    return [...this.entries.keys()];
  }

  private evict(): void {
    while (this.entries.size > this.capacityValue) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}

export function groundCacheCapacityForViewport(
  viewportWidth: number,
  viewportHeight: number,
  scale: number,
): number {
  const safeScale = Math.max(0.01, scale);
  const columns =
    Math.ceil(viewportWidth / safeScale / GROUND_CHUNK_PIXELS) + 1;
  const rows = Math.ceil(viewportHeight / safeScale / GROUND_CHUNK_PIXELS) + 1;
  return Math.max(64, Math.ceil(columns * rows * 1.5));
}

function drawGroundAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  tileX: number,
  tileY: number,
  frameIndex = 0,
): void {
  const selected = selectAtlasFrame(asset.metadata, "base", frameIndex);
  if (selected === null) return;
  const source = worldAssetFrameSource(context, asset, selected)!;
  context.drawImage(
    source.image,
    source.x,
    source.y,
    source.width,
    source.height,
    Math.round(tileX * TILE_SIZE_PIXELS + 8 - asset.anchor[0]),
    Math.round(tileY * TILE_SIZE_PIXELS + 15 - asset.anchor[1]),
    source.width,
    source.height,
  );
}

/** Exact lower native wall course: no rescaling or invented perspective cap. */
export function drawResidencePartitionBand(context:CanvasRenderingContext2D,asset:LoadedAsset,tileX:number,tileY:number):void {
  const selected=selectAtlasFrame(asset.metadata,'base',0);
  if(selected===null)return;
  const source=worldAssetFrameSource(context,asset,selected);
  if(source===null||source.width!==16||source.height!==48)return;
  context.drawImage(source.image,source.x,source.y+32,16,16,tileX*16,tileY*16,16,16);
}

function drawUndugCaveTile(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  tileX: number,
  tileY: number,
  frameIndex: number,
): void {
  drawGroundAsset(context, asset, tileX, tileY, frameIndex);
  context.save();
  // Cave_Floor_Middle is the canonical tile-sized underground field. Recolour
  // it to Cave_Walls' dark blocked-centre colour; do not substitute the dense
  // rocky walkable-floor frame here.
  context.globalCompositeOperation = "source-atop";
  context.fillStyle = "#391f21";
  context.fillRect(
    tileX * TILE_SIZE_PIXELS,
    tileY * TILE_SIZE_PIXELS,
    TILE_SIZE_PIXELS,
    TILE_SIZE_PIXELS,
  );
  context.restore();
}

function cellarOpenAt(terrain: TerrainArray, tileX: number, tileY: number): boolean {
  return groundTileInsideTerrain(terrain, tileX, tileY)
    && terrain.blocked[tileY * terrain.width + tileX] === false;
}

function cellarFloorPatchAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): 0 | 1 | null {
  // Keep full-tile transition art away from the wall atlas. Otherwise a newly
  // exposed wall can inherit a rocky floor pixel behind its transparent edge.
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (!cellarOpenAt(terrain, tileX + offsetX, tileY + offsetY)) return null;
    }
  }
  return caveFloorPatchVariantAt(
    terrain.seed,
    terrain.spaceId,
    tileX,
    tileY,
  );
}

export interface CellarGroundVisualLayer {
  readonly asset: string;
  readonly frame: number;
  readonly role: string;
}

export interface AuthoredFarmlandGroundLayer {
  readonly asset: 'tile_cf_farmland' | 'tile_cf_farmland_grass_inset';
  readonly frame: number;
}

/** Static dry authored farmland composition. Runtime wet soil remains a
 * separate authority-backed overlay drawn by the client after this cache. */
export function authoredFarmlandGroundLayersAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly AuthoredFarmlandGroundLayer[] {
  const frame = authoredFarmlandFrameIndexAt(terrain, tileX, tileY);
  if (frame === null) return [];
  return [
    { asset: 'tile_cf_farmland', frame },
    ...(frame === 0
      ? []
      : [{ asset: 'tile_cf_farmland_grass_inset' as const, frame }]),
  ];
}

function cellarFloorDetailLayersAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
  patchAtTile: (tileX: number, tileY: number) => 0 | 1 | null,
): readonly CellarGroundVisualLayer[] {
  let hasRockyPatchClearance = true;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (!cellarOpenAt(terrain, tileX + offsetX, tileY + offsetY)) {
        hasRockyPatchClearance = false;
      }
    }
  }
  if (hasRockyPatchClearance) {
    const patchAt = (offsetX: number, offsetY: number): 0 | 1 | null =>
      patchAtTile(tileX + offsetX, tileY + offsetY);
    const plan = caveFloorAutotilePlan(
      (offsetX, offsetY) => patchAt(offsetX, offsetY) !== null,
    );
    const nearbyVariant = patchAt(0, 0)
      ?? patchAt(0, -1)
      ?? patchAt(1, 0)
      ?? patchAt(0, 1)
      ?? patchAt(-1, 0)
      ?? patchAt(-1, -1)
      ?? patchAt(1, -1)
      ?? patchAt(-1, 1)
      ?? patchAt(1, 1);
    if (nearbyVariant !== null) {
      const asset = nearbyVariant === 0 ? 'tile_cf_cave_floor' : 'tile_cf_cave_floor_2';
      const layers: CellarGroundVisualLayer[] = [];
      if (plan.transitionFrame !== null) layers.push({
        asset,
        frame: plan.transitionFrame,
        role: 'rocky_floor_transition',
      });
      for (let index = 0; index < plan.insetFrames.length; index += 1) layers.push({
        asset,
        frame: plan.insetFrames[index]!,
        role: `rocky_floor_inset_${index + 1}`,
      });
      return layers;
    }
  }

  const decorationFrame = caveFloorDecorationFrameAt(
    terrain.seed,
    terrain.spaceId,
    tileX,
    tileY,
  );
  return decorationFrame === null ? [] : [{
    asset: 'tile_cf_cave_floor_decoration',
    frame: decorationFrame,
    role: 'cave_floor_decoration',
  }];
}

/** Exact source frames baked into one cellar ground-cache tile. Keeping this
 * composition plan shared with the renderer lets the G inspector expose the
 * real individual assets instead of presenting the cache as one opaque tile. */
export function cellarGroundVisualLayersAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly CellarGroundVisualLayer[] {
  if (!groundTileInsideTerrain(terrain, tileX, tileY)) return [];
  if (!cellarOpenAt(terrain, tileX, tileY)) return [{
    asset: 'ground_cache',
    frame: 0,
    role: 'base_ground',
  }];
  return [
    { asset: 'tile_cf_cave_floor_middle', frame: 0, role: 'base_ground' },
    ...cellarFloorDetailLayersAt(
      terrain,
      tileX,
      tileY,
      (x, y) => cellarFloorPatchAt(terrain, x, y),
    ),
  ];
}

function drawCellarFloorDetails(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
  localX: number,
  localY: number,
  patchAtTile: (tileX: number, tileY: number) => 0 | 1 | null,
): void {
  for (const layer of cellarFloorDetailLayersAt(
    terrain,
    tileX,
    tileY,
    patchAtTile,
  )) {
    const asset = art.terrainAssets[layer.asset];
    if (asset !== undefined) drawGroundAsset(context, asset, localX, localY, layer.frame);
  }
}

/** Frame zero in the grass-fringe blob sheet is intentionally solid grass.
 * Compose its authored north/south halves for an isolated sandy tile, matching
 * the reusable farmland renderer's handling of the same source sheet. */
function drawGrassSandTransition(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  tileX: number,
  tileY: number,
  frameIndex: number,
): void {
  if (frameIndex !== 0) {
    drawGroundAsset(context, asset, tileX, tileY, frameIndex);
    return;
  }
  const destinationX = tileX * TILE_SIZE_PIXELS;
  const destinationY = tileY * TILE_SIZE_PIXELS;
  for (const [sourceFrame, sourceY, destinationOffset] of [
    [5, 0, 0],
    [1, 8, 8],
  ] as const) {
    const selected = selectAtlasFrame(asset.metadata, "base", sourceFrame);
    if (selected === null) continue;
    const source = worldAssetFrameSource(context, asset, selected);
    if (source === null) continue;
    context.drawImage(
      source.image,
      source.x,
      source.y + sourceY,
      source.width,
      8,
      destinationX,
      destinationY + destinationOffset,
      source.width,
      8,
    );
  }
}

function groundAssetForBiome(
  art: OverworldArt,
  biome: SurvivalBiome,
): LoadedAsset {
  if (biome === 'paving') return art.terrainAssets['tile_cf_hearth_pavement'] ?? art.grass;
  if (biome === 'volcanic_ash') return art.rogueVolcanicFloor;
  if (biome === 'lava') return art.rogueVolcanicLava;
  if (biome === "water" || biome === "oasis_water") return art.water;
  if (biome === "freshwater") return art.grass;
  if (biome === "waterfall") return art.grass;
  if (biome === "beach") return art.beach;
  // Coastal cliff art is transparent outside the authored rock face. Sand is
  // the correct substrate there; using the default grass base made those
  // transparent pixels look like opaque green slabs around the cliff.
  if (biome === "coastal_cliff") return art.beach;
  if (biome === "desert_shore") return art.desertShore;
  if (biome === "desert" || biome === "desert_ridge") return art.desert;
  if (biome === "oasis" || biome === "savanna") return art.desertGrass;
  return art.grass;
}

/** Explicit material brushes use the native cap of their selected cliff.
 * Inherited/procedural terrain and independently authored grass palettes retain
 * their existing material; this is presentation, not geometry normalization. */
export function authoredCliffGroundLayerAt(terrain: TerrainArray, tileX: number, tileY: number) {
  const index=tileY*terrain.width+tileX;
  const surface=terrain.authoredSurfaces?.[index];
  if((surface!=='stone'&&surface!=='sand')||!terrain.cliffFamilies?.[index]
    ||terrain.surfaceFamilies?.[index])return null;
  const family=(TERRAIN_CLIFF_FAMILIES as Readonly<Record<string,TerrainCliffFamily>>)[terrainCliffFamilyAt(terrain,tileX,tileY)];
  if(!family?.available)return null;
  const live=terrain.tilesets?.tileSetFor(terrainCliffFamilyAt(terrain,tileX,tileY));
  if(live&&live.assetId!==family.tileSet.assetId)return null;
  return family.substrate?.cap??null;
}

export function groundAssetForTile(
  art: OverworldArt,
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
  biome: SurvivalBiome,
): LoadedAsset {
  const native=authoredCliffGroundLayerAt(terrain,tileX,tileY);
  if(native&&art.terrainAssets[native.assetId])return art.terrainAssets[native.assetId]!;
  if (terrain.authoredSurfaces?.[tileY*terrain.width+tileX] === 'cave_floor') {
    const family=terrainCliffFamilyAt(terrain,tileX,tileY);
    return family.startsWith('dungeon') ? art.rogueDungeonFloor : family.startsWith('volcanic') ? art.rogueVolcanicFloor : art.caveFloorMiddle;
  }
  if (biome==='paving'&&terrain.dirtTerraces[tileY*terrain.width+tileX])return art.farmland;
  if (!['plains','meadow','highland','forest','valley','ridge'].includes(biome)) return groundAssetForBiome(art, biome);
  const index = tileY * terrain.width + tileX;
  const familyId = surfaceFamilyAtIndex(terrain.surfaceFamilies?.[index] ?? 0)
    ?? terrain.defaultSurfaceFamily;
  if (familyId === undefined) return art.grass;
  const family = TERRAIN_SURFACE_FAMILIES[familyId];
  return art.terrainAssets[family.assetId] ?? art.grass;
}

/** Complete native grass fringes. Material priority makes family seams
 * deterministic; neighbors on a different height never bleed onto this plane. */
export function authoredGrassFringeLayersAt(terrain: TerrainArray, tileX: number, tileY: number): readonly {
  assetId: string; frame: number;
}[] | null {
  const vegetated = (biome: SurvivalBiome) => ['plains','meadow','forest','valley','highland','ridge'].includes(biome);
  const biome=terrainBiomeAt(terrain,tileX,tileY);
  if(!vegetated(biome)&&biome!=='beach'&&biome!=='paving')return null;
  const familyAt=(x:number,y:number)=>surfaceFamilyAtIndex(terrain.surfaceFamilies?.[y*terrain.width+x]??0)??terrain.defaultSurfaceFamily??'grass_1';
  const own=vegetated(biome)?familyAt(tileX,tileY):null;
  const height=terrainElevationAt(terrain,tileX,tileY);
  const neighbor=(dx:number,dy:number)=>{
    const x=tileX+dx,y=tileY+dy;
    if(!groundTileInsideTerrain(terrain,x,y)||!vegetated(terrainBiomeAt(terrain,x,y))||terrainElevationAt(terrain,x,y)!==height)return null;
    const family=familyAt(x,y);return own!==null&&family>=own?null:family;
  };
  const all=[neighbor(0,-1),neighbor(1,0),neighbor(0,1),neighbor(-1,0),neighbor(-1,-1),neighbor(1,-1),neighbor(-1,1),neighbor(1,1)];
  if(own===null&&!all.some(family=>family!==null&&family!=='grass_1'))return null;
  const layers:{assetId:string;frame:number}[]=[];
  for(const family of new Set(all.filter(value=>value!==null))){
    const definition=TERRAIN_SURFACE_FAMILIES[family];
    const mask=(all[0]===family?1:0)|(all[1]===family?2:0)|(all[2]===family?4:0)|(all[3]===family?8:0);
    // Adjacent sides use native corners, not overlapping straight fringes.
    // Opposite sides fill the tile; sheet frame 17 is transparent, so use the
    // separate opaque middle asset. -2 means no cardinal, -1 means full fill.
    const frame=[-2,1,18,2,33,-1,34,-1,16,0,-1,-1,32,-1,-1,-1][mask]!;
    if(frame===-1){layers.push({assetId:definition.assetId,frame:0});continue;}
    if(frame>=0)layers.push({assetId:definition.sheetAssetId,frame});
    // Flat diagonal fringes are the native quartet at columns 0–1, rows 3–4,
    // distinct from raised ledge insets. Their taper spans the entire 16px tile.
    for(const [dx,dy,corner] of [[-1,-1,65],[1,-1,64],[-1,1,49],[1,1,48]] as const){
      if(neighbor(dx,dy)===family&&neighbor(dx,0)!==family&&neighbor(0,dy)!==family)
        layers.push({assetId:definition.sheetAssetId,frame:corner});
    }
  }
  layers.sort((a,b)=>b.assetId.localeCompare(a.assetId));
  return layers;
}

function drawAuthoredGrassFringe(context:CanvasRenderingContext2D,art:OverworldArt,layers:NonNullable<ReturnType<typeof authoredGrassFringeLayersAt>>,localX:number,localY:number):void {
  for(const layer of layers){
    const asset=art.terrainAssets[layer.assetId];if(!asset)continue;
    const frame=selectAtlasFrame(asset.metadata,'base',layer.frame);if(!frame)continue;
    const source=worldAssetFrameSource(context,asset,frame);if(!source)continue;
    context.drawImage(source.image,source.x,source.y,16,16,localX*16,localY*16,16,16);
  }
}

export class GroundChunkCache {
  private readonly chunks: ChunkLruCache<HTMLCanvasElement>;
  private terrainKey = "";
  private residenceTerrain: TerrainArray | undefined;
  private presentationKey = "original";
  private presentationContext: CanvasRenderingContext2D | null = null;

  constructor(capacity = 64) {
    this.chunks = new ChunkLruCache(capacity);
  }

  get residentCount(): number {
    return this.chunks.size;
  }
  get residentKeys(): readonly string[] {
    return this.chunks.keys();
  }

  invalidateResource(tileX: number, tileY: number): void {
    this.chunks.invalidateResource(tileX, tileY);
  }

  /** Retain unaffected chunks only after a caller has verified a sparse edit. */
  adoptSparseTerrain(previous: TerrainArray, next: TerrainArray, points: readonly {tileX:number;tileY:number}[]): void {
    if(previous.width!==next.width||previous.height!==next.height||previous.seed!==next.seed||previous.generator!==next.generator)return;
    this.prepareTerrain(previous);
    this.terrainKey = `${next.spaceId}:${next.generator ?? "unknown"}:${next.width}x${next.height}:${next.seed}:${next.version}:${next.rogueRoomRevision ?? ''}`;
    // Include topology neighbors and the old/new projected cliff footprints.
    for(const point of points) {
      const index=point.tileY*next.width+point.tileX;
      const radius=4+Math.max(Math.abs((previous.elevations[index]??0)-terrainBaseDatum(previous))*terrainVisualProjectionRowsPerLevel(previous),Math.abs((next.elevations[index]??0)-terrainBaseDatum(next))*terrainVisualProjectionRowsPerLevel(next));
      for(let y=point.tileY-radius;y<=point.tileY+radius;y+=1)
        for(let x=point.tileX-2;x<=point.tileX+2;x+=1)this.invalidateResource(x,y);
    }
  }

  private prepareTerrain(terrain: TerrainArray): void {
    const key = `${terrain.spaceId}:${terrain.generator ?? "unknown"}:${terrain.width}x${terrain.height}:${terrain.seed}:${terrain.version}:${terrain.rogueRoomRevision ?? ''}`;
    const residence=terrain.generator==='residence'?terrain:undefined;
    if (key === this.terrainKey && residence===this.residenceTerrain) return;
    this.terrainKey = key;
    this.residenceTerrain=residence;
    this.chunks.clear();
  }

  private preparePresentation(context: CanvasRenderingContext2D): void {
    const key = worldAssetPresentationKey(context);
    if (key !== this.presentationKey) {
      this.presentationKey = key;
      this.chunks.clear(); // Visible chunks rebuild on demand; hidden chunks stay absent.
    }
    this.presentationContext = context;
  }

  draw(
    context: CanvasRenderingContext2D,
    art: OverworldArt,
    terrain: TerrainArray,
    cameraX: number,
    cameraY: number,
    scale: number,
    viewportWidth: number,
    viewportHeight: number,
  ): number {
    this.preparePresentation(context);
    this.chunks.setCapacity(
      groundCacheCapacityForViewport(viewportWidth, viewportHeight, scale),
    );
    this.prepareTerrain(terrain);
    const minChunkX = Math.max(0, Math.floor(cameraX / GROUND_CHUNK_PIXELS));
    const minChunkY = Math.max(0, Math.floor(cameraY / GROUND_CHUNK_PIXELS));
    const maxChunkX = Math.min(
      Math.ceil(terrain.width / SURVIVAL_CHUNK_TILES) - 1,
      Math.floor((cameraX + viewportWidth / scale) / GROUND_CHUNK_PIXELS),
    );
    const maxChunkY = Math.min(
      Math.ceil(terrain.height / SURVIVAL_CHUNK_TILES) - 1,
      Math.floor((cameraY + viewportHeight / scale) / GROUND_CHUNK_PIXELS),
    );
    let drawCalls = 0;
    if (terrainProjectionStyle(terrain) === 'interior' && terrain.rogueTheme === undefined) {
      const selected = selectAtlasFrame(art.caveFloorMiddle.metadata, "base", 0);
      const frame = selected === null ? null : worldAssetFrameSource(context, art.caveFloorMiddle, selected);
      if (frame !== null) {
        const firstTileX = Math.floor(cameraX / TILE_SIZE_PIXELS);
        const firstTileY = Math.floor(cameraY / TILE_SIZE_PIXELS);
        const lastTileX = Math.ceil(
          (cameraX + viewportWidth / scale) / TILE_SIZE_PIXELS,
        );
        const lastTileY = Math.ceil(
          (cameraY + viewportHeight / scale) / TILE_SIZE_PIXELS,
        );
        for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
          for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
            const destinationX = Math.round(
              (tileX * TILE_SIZE_PIXELS - cameraX) * scale,
            );
            const destinationY = Math.round(
              (tileY * TILE_SIZE_PIXELS - cameraY) * scale,
            );
            context.drawImage(
              frame.image,
              frame.x,
              frame.y,
              frame.width,
              frame.height,
              destinationX,
              destinationY,
              TILE_SIZE_PIXELS * scale,
              TILE_SIZE_PIXELS * scale,
            );
            context.save();
            context.globalCompositeOperation = "source-atop";
            context.fillStyle = "#391f21";
            context.fillRect(
              destinationX,
              destinationY,
              TILE_SIZE_PIXELS * scale,
              TILE_SIZE_PIXELS * scale,
            );
            context.restore();
          }
        }
        drawCalls += 1;
      }
    }
    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        const canvas = this.chunks.getOrCreate(chunkX, chunkY, () =>
          this.renderChunk(art, terrain, chunkX, chunkY),
        );
        const destination = snapRectForContext(context, {
          x: (chunkX * GROUND_CHUNK_PIXELS - cameraX) * scale,
          y: (chunkY * GROUND_CHUNK_PIXELS - cameraY) * scale,
          width: GROUND_CHUNK_PIXELS * scale, height: GROUND_CHUNK_PIXELS * scale,
        });
        context.drawImage(canvas, destination.x, destination.y, destination.width, destination.height);
        drawCalls += 1;
      }
    }
    return drawCalls;
  }

  /** Reuses an already-baked ground chunk as an elevation-aware cap run.
   * Runs never cross a chunk boundary, keeping each surface span to one draw. */
  drawProjectedRun(
    context: CanvasRenderingContext2D,
    art: OverworldArt,
    terrain: TerrainArray,
    firstTileX: number,
    lastTileX: number,
    tileY: number,
    visualOffset: number,
    cameraX: number,
    cameraY: number,
    scale: number,
  ): void {
    this.preparePresentation(context);
    this.prepareTerrain(terrain);
    const chunkX = Math.floor(firstTileX / SURVIVAL_CHUNK_TILES);
    const chunkY = Math.floor(tileY / SURVIVAL_CHUNK_TILES);
    if (Math.floor(lastTileX / SURVIVAL_CHUNK_TILES) !== chunkX) {
      throw new Error("Projected ground run crossed a chunk boundary");
    }
    const canvas = this.chunks.getOrCreate(chunkX, chunkY, () =>
      this.renderChunk(art, terrain, chunkX, chunkY),
    );
    const sourceX =
      (firstTileX - chunkX * SURVIVAL_CHUNK_TILES) * TILE_SIZE_PIXELS;
    const sourceY = (tileY - chunkY * SURVIVAL_CHUNK_TILES) * TILE_SIZE_PIXELS;
    const width = (lastTileX - firstTileX + 1) * TILE_SIZE_PIXELS;
    const source = groundLightSource(context, { image: canvas, x: sourceX, y: sourceY, width, height: TILE_SIZE_PIXELS },
      firstTileX * TILE_SIZE_PIXELS, tileY * TILE_SIZE_PIXELS, terrainElevationAt(terrain, firstTileX, tileY));
    const destination = snapRectForContext(context, {
      x: (firstTileX * TILE_SIZE_PIXELS - cameraX) * scale,
      y: (tileY * TILE_SIZE_PIXELS - visualOffset - cameraY) * scale,
      width: width * scale, height: TILE_SIZE_PIXELS * scale,
    });
    context.drawImage(
      source.image,
      source.x,
      source.y,
      width,
      TILE_SIZE_PIXELS,
      destination.x, destination.y, destination.width, destination.height,
    );
  }

  /** Draws the exact baked source tile for terrain-composition diagnostics.
   * This deliberately shares the resident chunk rather than approximating a
   * biome frame, so transitions and other ground overlays remain visible. */
  drawTilePreview(
    context: CanvasRenderingContext2D,
    art: OverworldArt,
    terrain: TerrainArray,
    tileX: number,
    tileY: number,
    destinationX: number,
    destinationY: number,
    size: number,
  ): boolean {
    if (
      tileX < 0 ||
      tileY < 0 ||
      tileX >= terrain.width ||
      tileY >= terrain.height
    )
      return false;
    this.prepareTerrain(terrain);
    const chunkX = Math.floor(tileX / SURVIVAL_CHUNK_TILES);
    const chunkY = Math.floor(tileY / SURVIVAL_CHUNK_TILES);
    const canvas = this.chunks.getOrCreate(chunkX, chunkY, () =>
      this.renderChunk(art, terrain, chunkX, chunkY),
    );
    context.drawImage(
      canvas,
      (tileX - chunkX * SURVIVAL_CHUNK_TILES) * TILE_SIZE_PIXELS,
      (tileY - chunkY * SURVIVAL_CHUNK_TILES) * TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      destinationX,
      destinationY,
      size,
      size,
    );
    return true;
  }

  private renderChunk(
    art: OverworldArt,
    terrain: TerrainArray,
    chunkX: number,
    chunkY: number,
  ): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = GROUND_CHUNK_PIXELS;
    canvas.height = GROUND_CHUNK_PIXELS;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Ground chunk Canvas 2D unavailable");
    if (this.presentationContext !== null) inheritWorldAssetPresentation(this.presentationContext, context);
    context.imageSmoothingEnabled = false;
    const firstTileX = chunkX * SURVIVAL_CHUNK_TILES;
    const firstTileY = chunkY * SURVIVAL_CHUNK_TILES;
    const cellarPatchCache = new Map<string, 0 | 1 | null>();
    const cachedCellarPatchAt = (tileX: number, tileY: number): 0 | 1 | null => {
      const key = `${tileX},${tileY}`;
      if (cellarPatchCache.has(key)) return cellarPatchCache.get(key) ?? null;
      const patch = terrain.generator === 'delve_lobby'
        ? (tileX >= 10 && tileX <= 13 && tileY >= 19 && tileY <= 20 ? 0 : null)
        : cellarFloorPatchAt(terrain, tileX, tileY);
      cellarPatchCache.set(key, patch);
      return patch;
    };
    const residenceCells=new Map((terrain.residenceArchitecture??[]).map(cell=>[`${cell.tileX},${cell.tileY}`,cell]));
    const residenceJambs=new Map<string,ReturnType<typeof hearthDoorwayFeatures>['jambs']>();
    for(const jamb of hearthDoorwayFeatures(terrain.residenceArchitecture??[]).jambs){
      const key=`${jamb.tileX},${jamb.tileY}`;const list=residenceJambs.get(key)??[];list.push(jamb);residenceJambs.set(key,list);
    }
    const frameTile=art.hearthInteriorFrame?selectAtlasFrame(art.hearthInteriorFrame.metadata,'base',0):null;
    const frameSource=frameTile?worldAssetFrameSource(context,art.hearthInteriorFrame,frameTile):null;
    const wallFrame=(sx:number,sy:number,w:number,h:number,x:number,y:number)=>{
      if(frameSource)context.drawImage(frameSource.image,frameSource.x+sx,frameSource.y+sy,w,h,x,y,w,h);
    };
    if(terrain.generator==='village_interior') {
      // Native caps extend five pixels into adjacent solid columns, exactly
      // meeting the vertical cut walls. Include neighbour chunks' overhangs.
      for(let y=0;y<SURVIVAL_CHUNK_TILES+3;y++)for(let x=-1;x<=SURVIVAL_CHUNK_TILES;x++) {
        const tx=firstTileX+x,ty=firstTileY+y;
        if(!residenceWallAt(terrain,tx,ty))continue;
        const frame=selectAtlasFrame(art.hearthInteriorWall.metadata,'base',0);
        const source=frame?worldAssetFrameSource(context,art.hearthInteriorWall,frame):null;
        const top=(y-1)*16;
        if(source)context.drawImage(source.image,source.x,source.y+16,16,32,x*16,top,16,32);
        wallFrame(16,10,16,6,x*16,top);
        for(const [dx,sx,offset] of [[-1,11,-5],[1,32,16]])if(!residenceWallAt(terrain,tx+dx!,ty)){
          wallFrame(sx!,10,5,6,x*16+offset!,top);
          wallFrame(sx!,16,5,16,x*16+offset!,top+6);
          wallFrame(sx!,16,5,10,x*16+offset!,top+22);
        }
      }
    }
    if (terrain.generator === 'residence') {
      const envelope={...terrain,blocked:terrain.residenceEnvelopeBlocked??terrain.blocked};
      // A wall anchored in the next chunk may project two rows into this one.
      // Render that overhang here too; each canvas clips to its own chunk.
      for (let y = 0; y < SURVIVAL_CHUNK_TILES + 2; y++) for (let x = 0; x < SURVIVAL_CHUNK_TILES; x++) {
        if (residenceWallAt(envelope, firstTileX + x, firstTileY + y)) {
          drawGroundAsset(context, art.hearthInteriorWall, x, y);
        }
      }
    }
    for (let localY = 0; localY < SURVIVAL_CHUNK_TILES; localY += 1) {
      for (let localX = 0; localX < SURVIVAL_CHUNK_TILES; localX += 1) {
        const tileX = firstTileX + localX;
        const tileY = firstTileY + localY;
        // The final cache chunk can be only partially occupied. Leaving its
        // unused cells to terrainBiomeAt's water fallback paints a fake ocean
        // outside finite maps and editor inspection windows.
        if (!groundTileInsideTerrain(terrain, tileX, tileY)) continue;
        if(terrain.generator==='village_interior'){
          const index=tileY*terrain.width+tileX;
          if(!terrain.blocked[index]) {
            const style=terrain.hearthInteriorFloorStyles?.[index]??0;
            const floor=style===1?art.hearthTownhouseFloor:style===2?art.rogueDungeonFloor:style===3?art.farmland:art.woodFloor;
            drawGroundAsset(context,floor,localX,localY,style===3?46:0);
          }
          else {
            const open=(x:number,y:number)=>x>=0&&y>=0&&x<terrain.width&&y<terrain.height&&!terrain.blocked[y*terrain.width+x];
            const left=open(tileX-1,tileY),right=open(tileX+1,tileY),above=open(tileX,tileY-1);
            // Both faces matter for a one-cell partition between two rooms.
            if(left)wallFrame(32,16,5,16,localX*16,localY*16);
            if(right)wallFrame(11,16,5,16,localX*16+11,localY*16);
            if(above){
              wallFrame(16,32,16,7,localX*16,localY*16);
              if(!open(tileX-1,tileY-1))wallFrame(11,32,5,7,localX*16-5,localY*16);
              if(!open(tileX+1,tileY-1))wallFrame(32,32,5,7,localX*16+16,localY*16);
            }
          }
          continue;
        }
        if(terrain.generator==='residence') {
          const index=tileY*terrain.width+tileX;
          if((terrain.residenceEnvelopeBlocked??terrain.blocked)[index])continue;
          const cell=residenceCells.get(`${tileX},${tileY}`);
          drawGroundAsset(context,cell?.floor==='townhouse'?art.hearthTownhouseFloor:art.woodFloor,localX,localY);
          if(cell?.partition==='wall')drawResidencePartitionBand(context,art.hearthInteriorWall,localX,localY);
          for(const jamb of residenceJambs.get(`${tileX},${tileY}`)??[]){
            const asset=jamb.side==='left'?art.hearthDoorwayJambLeft:art.hearthDoorwayJambRight;
            const frame=selectAtlasFrame(asset.metadata,'base',0);
            const source=frame===null?null:worldAssetFrameSource(context,asset,frame);
            if(source)context.drawImage(source.image,source.x,source.y,source.width,source.height,
              jamb.x-firstTileX*16,jamb.y-firstTileY*16,source.width,source.height);
          }
          continue;
        }
        if (terrain.generator === "marlow_tent") {
          const index = tileY * terrain.width + tileX;
          if (terrain.blocked[index]) continue;
          drawGroundAsset(context, art.woodFloor, localX, localY, 0);
          const northBlocked =
            tileY === 0 || terrain.blocked[(tileY - 1) * terrain.width + tileX];
          if (northBlocked && terrain.generator === "marlow_tent")
            drawGroundAsset(context, art.interiorWall, localX, localY);
          continue;
        }
        if (terrainProjectionStyle(terrain) === 'interior'
          && terrain.rogueTheme === undefined) {
          const index = tileY * terrain.width + tileX;
          if (!terrain.blocked[index]) {
            drawGroundAsset(context, art.caveFloorMiddle, localX, localY);
            drawCellarFloorDetails(
              context,
              art,
              terrain,
              tileX,
              tileY,
              localX,
              localY,
              cachedCellarPatchAt,
            );
          } else {
            // Uncut rock is only the continuous raised-plane substrate. The
            // shared raised-terrain resolver owns every cap, corner and face;
            // duplicating a 3x3 ring here makes those layers disagree.
            drawUndugCaveTile(context, art.caveFloorMiddle, localX, localY, 0);
          }
          continue;
        }
        if (terrain.rogueTheme !== undefined) {
          const index = tileY * terrain.width + tileX;
          const blocked = terrain.blocked[index] === true;
          const hazardous = terrain.rogueHazards?.[index] === 1;
          const theme = terrain.generator === 'delve_lobby' && !blocked
            ? hearthLobbyFloorTheme(tileY,terrain.hearthLobbyFloorThresholdY)
            : terrain.rogueTheme ?? 'cave';
          const destinationX = localX * TILE_SIZE_PIXELS;
          const destinationY = localY * TILE_SIZE_PIXELS;
          context.fillStyle = theme === 'volcanic'
            ? hazardous ? '#f47e1b' : blocked ? '#211519' : '#493f4b'
            : theme === 'dungeon'
              ? blocked ? '#0e071b' : '#424c6e'
              : blocked ? '#391f21' : '#4a4148';
          context.fillRect(destinationX, destinationY, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS);
          const floorAsset = theme === 'volcanic' ? art.rogueVolcanicFloor
            : theme === 'dungeon' ? art.rogueDungeonFloor : art.caveFloorMiddle;
          const authoredFieldFrame = ((tileY % 3) * 3 + tileX % 3 + 9) % 9;
          if (hazardous && theme === 'volcanic') {
            drawGroundAsset(
              context,
              art.rogueVolcanicLava,
              localX,
              localY,
              terrainDecorationHash(tileX + terrain.seed, tileY) % 4,
            );
          } else if (blocked) {
            // This is only the continuous solid-rock substrate. The raised
            // terrain queue owns the visible caps, joins, corners and wall
            // courses, just as it does in the excavated cellar.
            if (theme === 'cave') {
              drawUndugCaveTile(context, art.caveFloorMiddle, localX, localY, 0);
            } else {
              drawGroundAsset(
                context,
                theme === 'volcanic' ? art.rogueVolcanicWall : art.rogueDungeonWall,
                localX,
                localY,
                authoredFieldFrame,
              );
            }
          } else {
            drawGroundAsset(
              context,
              floorAsset,
              localX,
              localY,
              theme === 'cave' ? 0 : authoredFieldFrame,
            );
            if (theme === 'cave') {
              drawCellarFloorDetails(
                context,
                art,
                terrain,
                tileX,
                tileY,
                localX,
                localY,
                cachedCellarPatchAt,
              );
            }
          }
          continue;
        }
        const biome = terrainBiomeAt(terrain, tileX, tileY);
        const destinationX = localX * TILE_SIZE_PIXELS;
        const destinationY = localY * TILE_SIZE_PIXELS;
        context.fillStyle = terrainColorAt(terrain, tileX, tileY);
        context.fillRect(
          destinationX,
          destinationY,
          TILE_SIZE_PIXELS,
          TILE_SIZE_PIXELS,
        );
        const base = groundAssetForTile(art, terrain, tileX, tileY, biome);
        const interiorFloor = terrain.authoredSurfaces?.[tileY*terrain.width+tileX] === 'cave_floor';
        const nativeGround=authoredCliffGroundLayerAt(terrain,tileX,tileY);
        const nativeFrame=nativeGround&&art.terrainAssets[nativeGround.assetId]===base?nativeGround.frame:null;
        const baseFrame = nativeFrame ?? (
          interiorFloor ? (base === art.caveFloorMiddle ? 0 : (tileY % 3)*3+tileX%3) : biome === 'paving'
            ? terrain.dirtTerraces[tileY*terrain.width+tileX]?46:(tileY % 2) * 2 + tileX % 2
            : biome === 'volcanic_ash' || biome === 'lava'
            ? 4
            : biome === "beach"
            ? beachFrameIndexAt(terrain, tileX, tileY)
            : biome === "coastal_cliff"
              ? 4
              : biome === "desert_shore"
                ? desertShoreFrameIndexAt(terrain, tileX, tileY)
                : 0);
        drawGroundAsset(context, base, localX, localY, baseFrame);
        if (interiorFloor) continue;

        for (const shorelineInsetFrame of shorelineInsetFrameIndicesAt(
          terrain,
          tileX,
          tileY,
        )) {
          drawGroundAsset(
            context,
            biome === "beach" ? art.beachInset : art.desertShoreInset,
            localX,
            localY,
            shorelineInsetFrame,
          );
        }

        const grassSandFrame = grassSandTransitionFrameIndexAt(
          terrain,
          tileX,
          tileY,
        );
        const authoredFringe=authoredGrassFringeLayersAt(terrain,tileX,tileY);
        if(authoredFringe!==null)drawAuthoredGrassFringe(context,art,authoredFringe,localX,localY);
        if (authoredFringe===null && grassSandFrame !== null)
          drawGrassSandTransition(
            context,
            art.farmlandGrassInset,
            localX,
            localY,
            grassSandFrame,
          );

        const pavingGrassFrame=pavingGrassTransitionFrameIndexAt(terrain,tileX,tileY);
        if(authoredFringe===null && pavingGrassFrame!==null)drawGrassSandTransition(context,art.farmlandGrassInset,localX,localY,pavingGrassFrame);

        const savannaGrassFrame = savannaGrassTransitionFrameIndexAt(
          terrain,
          tileX,
          tileY,
        );
        if (savannaGrassFrame !== null)
          drawGrassSandTransition(
            context,
            art.savannaGrassInset,
            localX,
            localY,
            savannaGrassFrame,
          );

        const desertGrassFrame = desertGrassEdgeFrameIndexAt(
          terrain,
          tileX,
          tileY,
        );
        if (desertGrassFrame !== null)
          drawGroundAsset(
            context,
            art.desertGrassEdge,
            localX,
            localY,
            desertGrassFrame,
          );
        for (const desertGrassInsetFrame of desertGrassInsetFrameIndicesAt(
          terrain,
          tileX,
          tileY,
        )) {
          drawGroundAsset(
            context,
            art.desertGrassInset,
            localX,
            localY,
            desertGrassInsetFrame,
          );
        }

        if (biome === "freshwater")
          drawGroundAsset(
            context,
            art.freshwater,
            localX,
            localY,
            freshwaterFrameIndexAt(terrain, tileX, tileY),
          );
        if (biome === "freshwater") {
          for (const insetFrame of freshwaterInsetFrameIndicesAt(
            terrain,
            tileX,
            tileY,
          )) {
            drawGroundAsset(
              context,
              art.freshwaterInset,
              localX,
              localY,
              insetFrame,
            );
          }
        }

        const waterfallFrame = waterfallUsesRaisedCompositionAt(
          terrain,
          tileX,
          tileY,
        ) ? null : waterfallFrameIndexAt(terrain, tileX, tileY);
        if (waterfallFrame !== null)
          drawGroundAsset(
            context,
            art.waterfall,
            localX,
            localY,
            waterfallFrame,
          );

        const dirtTerraceFrame = dirtTerraceFrameIndexAt(terrain, tileX, tileY);
        if (dirtTerraceFrame !== null && biome !== 'paving') {
          drawGroundAsset(
            context,
            art.dirtTerrace,
            localX,
            localY,
            dirtTerraceFrame,
          );
          drawGroundAsset(
            context,
            art.dirtCliffEdge,
            localX,
            localY,
            dirtTerraceFrame,
          );
        }
        const dirtRampFrame = dirtTerraceRampFrameIndexAt(
          terrain,
          tileX,
          tileY,
        );
        if (dirtRampFrame !== null)
          drawGroundAsset(
            context,
            art.dirtCliffRamp,
            localX,
            localY,
            dirtRampFrame,
          );

        for (const layer of authoredFarmlandGroundLayersAt(terrain, tileX, tileY)) {
          drawGroundAsset(
            context,
            layer.asset === 'tile_cf_farmland' ? art.farmland : art.farmlandGrassInset,
            localX,
            localY,
            layer.frame,
          );
        }

        const hash = terrainDecorationHash(tileX, tileY);
        if (
          waterDecorationAllowedAt(terrain, tileX, tileY) &&
          hash % 37 === 0
        ) {
          drawGroundAsset(context, art.waterRipples, localX, localY);
        }
      }
    }
    return canvas;
  }
}
