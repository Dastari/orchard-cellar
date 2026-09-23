import { MAP_BIOME_IDS, type TerrainSurfaceFamilyId, type MapBiomeId, type MapCellPatch, type MapPrefabDocumentV2 } from '@orchard/sim';
import { terrainCliffFamilyChoices, terrainSurfaceFamilyChoices, type TerrainAuthoringPalette, type TerrainPalettePreview } from './terrain-authoring-palette.js';

export interface MapMaterialChoice {
  readonly id: string;
  readonly label: string;
  readonly patch: Readonly<MapCellPatch>;
  readonly biome?: MapBiomeId;
  readonly preview: TerrainPalettePreview;
}

/** Material choices, never individual transition frames. Topology is resolved by
 * the shared compiler from the painted surface, family and neighboring heights. */
export function mapMaterialChoices(palette: TerrainAuthoringPalette, query = ''): readonly MapMaterialChoice[] {
  const choices: MapMaterialChoice[] = terrainSurfaceFamilyChoices('', palette).map(choice => ({
    id: choice.familyId, label: choice.label, preview: choice.preview, biome:'plains',
    patch: { surface: 'grass', feature: 'none', surfaceFamily: choice.familyId, cliffFamily: `stone_${choice.familyId.slice(-1)}`, terrainOverride: null },
  }));
  choices.push(
    { id:'dirt', label:'Dirt', biome:'dirt_terrace', preview:{assetId:'tile_cf_path',frameIndex:0}, patch:{surface:'dirt',feature:'none',terrainOverride:null} },
    { id:'sand', label:'Beach', biome:'beach', preview:{assetId:'tile_cf_beach',frameIndex:0}, patch:{surface:'sand',feature:'none',cliffFamily:'desert_1',terrainOverride:null} },
    { id:'water', label:'Fresh water', biome:'freshwater', preview:{assetId:'tile_cf_freshwater',frameIndex:0}, patch:{surface:'water',feature:'river',terrainOverride:null} },
    { id:'ocean', label:'Ocean', biome:'water', preview:{assetId:'tile_cf_water',frameIndex:0}, patch:{surface:'water',feature:'none',terrainOverride:null} },
    { id:'path', label:'Path', biome:'dirt_terrace', preview:{assetId:'tile_cf_path',frameIndex:0}, patch:{surface:'dirt',feature:'path',terrainOverride:null} },
    { id:'farmland', label:'Farmland', biome:'dirt_terrace', preview:{assetId:'tile_cf_farmland',frameIndex:0}, patch:{surface:'dirt',feature:'farmland',terrainOverride:null} },
  );
  for (const choice of terrainCliffFamilyChoices('', palette)) choices.push({
    id:choice.familyId, label:choice.label, preview:choice.preview, biome:choice.familyId.startsWith('desert')?'desert':choice.familyId.startsWith('volcanic')?'volcanic_ash':'highland',
    patch:{ surface:choice.familyId.startsWith('desert') ? 'sand' : choice.familyId === 'cave' || choice.projectionStyle === 'interior' ? 'cave_floor' : 'stone', feature:'none', cliffFamily:choice.familyId, surfaceFamily:choice.familyId.startsWith('stone_')?`grass_${choice.familyId.slice(-1)}` as TerrainSurfaceFamilyId:choice.familyId==='basic'?'grass_1':null, terrainOverride:null },
  });
  const biomePreview: Record<MapBiomeId,string> = {
    water:'tile_cf_water',beach:'tile_cf_beach',freshwater:'tile_cf_freshwater',waterfall:'tile_cf_waterfall',
    plains:'tile_cf_grass',meadow:'tile_cf_grass_meadow',forest:'tile_cf_grass',valley:'tile_cf_grass',highland:'tile_cf_grass_highland',ridge:'tile_cf_stone_cliff_variants',
    desert:'tile_cf_desert',desert_shore:'tile_cf_desert_shore',desert_ridge:'tile_cf_desert_cliff',oasis:'tile_cf_desert_grass',oasis_water:'tile_cf_freshwater',savanna:'tile_cf_desert_grass',
    coastal_cliff:'tile_cf_stone_cliff_variants',dirt_terrace:'tile_cf_path',dirt_ridge:'tile_cf_grass_dirt_cliff_edge',volcanic_ash:'tile_cf_rogue_volcanic_floor',lava:'tile_cf_rogue_volcanic_lava',paving:'tile_cf_hearth_pavement',
  };
  for (const biome of MAP_BIOME_IDS) choices.push({id:`biome-${biome}`,label:biome.replaceAll('_',' '),biome,
    preview:{assetId:biomePreview[biome],frameIndex:0},patch:{
      surface:['water','freshwater','waterfall','oasis_water'].includes(biome)?'water':biome==='lava'||biome==='paving'?'stone':biome.startsWith('desert')||biome==='beach'?'sand':biome.startsWith('dirt')?'dirt':'grass',
      feature:['freshwater','oasis_water','waterfall'].includes(biome)?'river':'none',
      surfaceFamily:biome==='meadow'?'grass_2':biome==='highland'?'grass_3':null,
      cliffFamily:biome.startsWith('desert')?'desert_1':biome==='lava'||biome==='volcanic_ash'?'volcanic':'stone_1',
      collision:biome==='lava'?'force_block':'inherit',collisionReason:biome==='lava'?'Lava terrain':'',terrainOverride:null,
    }});
  const terms = query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
  return choices.map(choice=>({...choice,patch:{collision:'inherit' as const,collisionReason:'',cliffFamily:'stone_1',surfaceFamily:null,ledge:false,...choice.patch}})).filter(choice => terms.every(term => `${choice.id} ${choice.label}`.toLowerCase().includes(term)));
}

export const MAP_OBJECT_FILTERS = ['all', 'plants', 'fences', 'buildings', 'prefabs', 'other'] as const;
export type MapObjectFilter = typeof MAP_OBJECT_FILTERS[number];
export function mapObjectCategory(prefab: MapPrefabDocumentV2): Exclude<MapObjectFilter, 'all'> {
  const text = [prefab.id, prefab.title, ...prefab.tags, ...prefab.placements.map(p => p.assetName)].join(' ').toLowerCase();
  if (/fence|hedge|picket|gate/u.test(text)) return 'fences';
  if (/tree|plant|crop|flower|bush|sprout|grass|mushroom/u.test(text)) return 'plants';
  if (/building|house|barn|tower|cottage|roof|tent/u.test(text)) return 'buildings';
  if (prefab.placements.length > 1 || !prefab.id.startsWith('asset-') && !prefab.id.startsWith('content-')) return 'prefabs';
  return 'other';
}

export function mapPaletteColumns(logicalWidth: number): number {
  return Math.max(3, Math.floor((logicalWidth - 4) / 46));
}
