import type { CharacterActionKind } from '@orchard/sim';

export {
  characterActionAnimation as studioActionAnimation,
  actionToolFlipsForDirection as studioFlips,
  characterLocomotionAnimation as studioLocomotionAnimation,
  characterToolAnimation as studioToolAnimation,
} from '@orchard/sim';

export const STUDIO_MATERIALS = ['iron', 'bronze', 'gold', 'blue', 'green', 'red'] as const;
export type StudioMaterial = (typeof STUDIO_MATERIALS)[number];
export type StudioAction = Extract<
  CharacterActionKind,
  'swing_sword' | 'swing_pickaxe' | 'swing_axe' | 'ranged_weapon'
>;
export type StudioEquipmentSlot = 'head' | 'body' | 'legs';
export type StudioVisualFamily = 'plate_helmet' | 'heavy_plate_helmet' | 'plate_chest' | 'plate_legs';
export type StudioRavenIconSet = 'masks' | 'chestCore' | 'chestColor' | 'bootsCore' | 'bootsColor';
export type StudioPaletteRamp = readonly [string, string, string, string];

export const STUDIO_MATERIAL_RAMPS: Readonly<Record<StudioMaterial, readonly string[]>> = {
  iron: ['#424c6e', '#6c7c9d', '#8e9ab4', '#c0cbdc'],
  bronze: ['#743f39', '#b86f50', '#e4a672', '#ead4aa'],
  gold: ['#dd5a08', '#feae34', '#fee761', '#fff7d2'],
  blue: ['#0069aa', '#0098dc', '#00cdf9', '#94fdff'],
  green: ['#1e6f50', '#33984b', '#5ac54f', '#d3fc7e'],
  red: ['#891e2b', '#c42430', '#f5555d', '#f8a0a6'],
};

export const IRON_RAMP = STUDIO_MATERIAL_RAMPS.iron;

export interface StudioEquipmentItem {
  readonly id: string;
  readonly name: string;
  readonly slot: StudioEquipmentSlot;
  readonly visualFamily: StudioVisualFamily;
  readonly material: StudioMaterial;
  readonly note: string;
  readonly source?: 'raven';
  readonly icon?: {
    readonly set: StudioRavenIconSet;
    readonly frame: string;
  };
  readonly paletteRamp?: StudioPaletteRamp;
  readonly templateName?: string;
}

export const STUDIO_EQUIPMENT_ITEMS: readonly StudioEquipmentItem[] = [
  { id: 'helm_iron', name: 'Iron Helm', slot: 'head', visualFamily: 'plate_helmet', material: 'iron', note: 'Animated wearable template' },
  { id: 'helm_bronze', name: 'Bronze Helm', slot: 'head', visualFamily: 'plate_helmet', material: 'bronze', note: 'Same geometry, generated palette' },
  { id: 'helm_gold', name: 'Gold Helm', slot: 'head', visualFamily: 'plate_helmet', material: 'gold', note: 'Same geometry, generated palette' },
  { id: 'helm_heavy', name: 'Heavy Iron Helm', slot: 'head', visualFamily: 'heavy_plate_helmet', material: 'iron', note: 'Second authored silhouette' },
  { id: 'raven_helm_ivory', name: 'Ivory Skull Mask', slot: 'head', visualFamily: 'plate_helmet', material: 'iron', source: 'raven', icon: { set: 'masks', frame: 'ivory_skull' }, paletteRamp: ['#181425', '#3d3c49', '#778189', '#e6e5e1'], templateName: 'open plate helm', note: 'Raven palette → open plate helm' },
  { id: 'raven_helm_bone', name: 'Bone Visor', slot: 'head', visualFamily: 'heavy_plate_helmet', material: 'iron', source: 'raven', icon: { set: 'masks', frame: 'bone_visor' }, paletteRamp: ['#181425', '#322c35', '#778189', '#e6e5e1'], templateName: 'heavy plate helm', note: 'Raven palette → heavy plate helm' },
  { id: 'raven_helm_crimson', name: 'Crimson Guard', slot: 'head', visualFamily: 'heavy_plate_helmet', material: 'red', source: 'raven', icon: { set: 'masks', frame: 'crimson_guard' }, paletteRamp: ['#3a0406', '#61080b', '#b11418', '#e0e9ee'], templateName: 'heavy plate helm', note: 'Raven palette → heavy plate helm' },
  { id: 'raven_helm_azure', name: 'Azure Demon Mask', slot: 'head', visualFamily: 'plate_helmet', material: 'blue', source: 'raven', icon: { set: 'masks', frame: 'azure_demon' }, paletteRamp: ['#0a1c6b', '#1e3284', '#4f6ed6', '#7794f3'], templateName: 'open plate helm', note: 'Raven palette → open plate helm' },
  { id: 'raven_helm_sun', name: 'Sun Mask', slot: 'head', visualFamily: 'heavy_plate_helmet', material: 'gold', source: 'raven', icon: { set: 'masks', frame: 'sun_mask' }, paletteRamp: ['#1c1202', '#744002', '#b36d0b', '#e6d4aa'], templateName: 'heavy plate helm', note: 'Raven palette → heavy plate helm' },
  { id: 'raven_helm_bronze', name: 'Bronze Faceguard', slot: 'head', visualFamily: 'plate_helmet', material: 'bronze', source: 'raven', icon: { set: 'masks', frame: 'bronze_face' }, paletteRamp: ['#180e05', '#602f0c', '#bd761c', '#dcc9b1'], templateName: 'open plate helm', note: 'Raven palette → open plate helm' },
  { id: 'chest_iron', name: 'Iron Plate', slot: 'body', visualFamily: 'plate_chest', material: 'iron', note: 'Animated wearable template' },
  { id: 'chest_bronze', name: 'Bronze Plate', slot: 'body', visualFamily: 'plate_chest', material: 'bronze', note: 'Same geometry, generated palette' },
  { id: 'chest_gold', name: 'Gold Plate', slot: 'body', visualFamily: 'plate_chest', material: 'gold', note: 'Same geometry, generated palette' },
  { id: 'raven_chest_ivory', name: 'Ivory Brigandine', slot: 'body', visualFamily: 'plate_chest', material: 'iron', source: 'raven', icon: { set: 'chestCore', frame: 'ivory_tunic' }, paletteRamp: ['#14110d', '#726047', '#c3ac80', '#e7ddca'], templateName: 'plate chest', note: 'Raven palette → plate chest' },
  { id: 'raven_chest_steel', name: 'Steel Longcoat', slot: 'body', visualFamily: 'plate_chest', material: 'iron', source: 'raven', icon: { set: 'chestCore', frame: 'steel_coat' }, paletteRamp: ['#090b0c', '#142024', '#5c7b7e', '#c7d3d5'], templateName: 'plate chest', note: 'Raven palette → plate chest' },
  { id: 'raven_chest_black', name: 'Black Knight Plate', slot: 'body', visualFamily: 'plate_chest', material: 'iron', source: 'raven', icon: { set: 'chestCore', frame: 'black_plate' }, paletteRamp: ['#08090b', '#121518', '#252a30', '#797f8d'], templateName: 'plate chest', note: 'Raven palette → plate chest' },
  { id: 'raven_chest_crimson', name: 'Crimson Officer Coat', slot: 'body', visualFamily: 'plate_chest', material: 'red', source: 'raven', icon: { set: 'chestColor', frame: 'crimson_plate' }, paletteRamp: ['#181a1a', '#5f2729', '#c3474f', '#cee0e0'], templateName: 'plate chest', note: 'Raven palette → plate chest' },
  { id: 'raven_chest_violet', name: 'Violet Spell Plate', slot: 'body', visualFamily: 'plate_chest', material: 'blue', source: 'raven', icon: { set: 'chestColor', frame: 'violet_plate' }, paletteRamp: ['#181a1a', '#53275f', '#af47c3', '#cee0e0'], templateName: 'plate chest', note: 'Raven palette → plate chest' },
  { id: 'raven_chest_verdant', name: 'Verdant Warden Plate', slot: 'body', visualFamily: 'plate_chest', material: 'green', source: 'raven', icon: { set: 'chestColor', frame: 'verdant_plate' }, paletteRamp: ['#253231', '#45504f', '#83c347', '#e3f1f1'], templateName: 'plate chest', note: 'Raven palette → plate chest' },
  { id: 'legs_iron', name: 'Iron Greaves', slot: 'legs', visualFamily: 'plate_legs', material: 'iron', note: 'Animated wearable template' },
  { id: 'legs_bronze', name: 'Bronze Greaves', slot: 'legs', visualFamily: 'plate_legs', material: 'bronze', note: 'Same geometry, generated palette' },
  { id: 'legs_gold', name: 'Gold Greaves', slot: 'legs', visualFamily: 'plate_legs', material: 'gold', note: 'Same geometry, generated palette' },
  { id: 'raven_legs_steel', name: 'Steel Trail Boots', slot: 'legs', visualFamily: 'plate_legs', material: 'iron', source: 'raven', icon: { set: 'bootsCore', frame: 'steel_boots' }, paletteRamp: ['#101616', '#273433', '#6c8f8c', '#d0ebe8'], templateName: 'plate greaves', note: 'Raven palette → plate greaves' },
  { id: 'raven_legs_black', name: 'Night Plate Boots', slot: 'legs', visualFamily: 'plate_legs', material: 'iron', source: 'raven', icon: { set: 'bootsCore', frame: 'black_boots' }, paletteRamp: ['#030303', '#100e0d', '#2f2c2a', '#929796'], templateName: 'plate greaves', note: 'Raven palette → plate greaves' },
  { id: 'raven_legs_green', name: 'Mossguard Boots', slot: 'legs', visualFamily: 'plate_legs', material: 'green', source: 'raven', icon: { set: 'bootsColor', frame: 'green_boots' }, paletteRamp: ['#0a1406', '#1e3014', '#496e35', '#618a4b'], templateName: 'plate greaves', note: 'Raven palette → plate greaves' },
  { id: 'raven_legs_violet', name: 'Violet Rune Boots', slot: 'legs', visualFamily: 'plate_legs', material: 'blue', source: 'raven', icon: { set: 'bootsColor', frame: 'violet_boots' }, paletteRamp: ['#0b0913', '#2e264b', '#5a5083', '#7f74ab'], templateName: 'plate greaves', note: 'Raven palette → plate greaves' },
  { id: 'raven_legs_crimson', name: 'Crimson March Boots', slot: 'legs', visualFamily: 'plate_legs', material: 'red', source: 'raven', icon: { set: 'bootsColor', frame: 'crimson_boots' }, paletteRamp: ['#0d0506', '#310f13', '#5a2f34', '#ac7178'], templateName: 'plate greaves', note: 'Raven palette → plate greaves' },
] as const;

export function materialColorMap(material: StudioMaterial): ReadonlyMap<string, string> {
  const target = STUDIO_MATERIAL_RAMPS[material];
  return new Map(IRON_RAMP.map((color, index) => [color, target[index] ?? color]));
}

export function equipmentPalette(item: StudioEquipmentItem): readonly string[] {
  return item.paletteRamp ?? STUDIO_MATERIAL_RAMPS[item.material];
}

export function itemById(id: string): StudioEquipmentItem | null {
  return STUDIO_EQUIPMENT_ITEMS.find((item) => item.id === id) ?? null;
}

export const CHARACTER_TOOL_REGISTRATION = Object.freeze({
  id: 'character', label: 'Character Studio', mode: 'author' as const, icon: 'editor.character',
  routes: Object.freeze(['/author/character'] as const),
  docks: Object.freeze(['asset_library', 'inspector', 'animation_preview'] as const),
  commands: Object.freeze([{ id: 'character.preview', label: 'Preview character' }] as const),
});

export interface CharacterStudioSnapshot {
  readonly action: StudioAction;
  readonly facing: 'down' | 'left' | 'right' | 'up';
  readonly equipment: Readonly<Record<StudioEquipmentSlot, string>>;
}

export class CharacterStudioModel {
  #action: StudioAction = 'swing_sword';
  #facing: CharacterStudioSnapshot['facing'] = 'down';
  readonly #equipment: Record<StudioEquipmentSlot, string> = {
    head: 'helm_iron', body: 'chest_iron', legs: 'legs_iron',
  };

  snapshot(): CharacterStudioSnapshot {
    return Object.freeze({ action: this.#action, facing: this.#facing, equipment: Object.freeze({ ...this.#equipment }) });
  }

  selectAction(action: StudioAction): CharacterStudioSnapshot { this.#action = action; return this.snapshot(); }
  face(facing: CharacterStudioSnapshot['facing']): CharacterStudioSnapshot { this.#facing = facing; return this.snapshot(); }
  equip(id: string): CharacterStudioSnapshot {
    const item = itemById(id);
    if (item === null) throw new Error(`unknown_studio_equipment:${id}`);
    this.#equipment[item.slot] = id;
    return this.snapshot();
  }

  equipped(): readonly [StudioEquipmentItem, StudioEquipmentItem, StudioEquipmentItem] {
    const head = itemById(this.#equipment.head);
    const body = itemById(this.#equipment.body);
    const legs = itemById(this.#equipment.legs);
    if (head === null || body === null || legs === null) throw new Error('invalid_studio_equipment_state');
    return Object.freeze([head, body, legs]);
  }
}
