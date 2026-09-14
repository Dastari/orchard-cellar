import type { UiIconName } from '@orchard/ui';

export type EditorIconId =
  | 'editor.route.map'
  | 'editor.route.object'
  | 'editor.route.ui_lab'
  | 'editor.route.character'
  | 'editor.route.items'
  | 'editor.workspace.terrain'
  | 'editor.workspace.objects'
  | 'editor.workspace.biomes'
  | 'editor.workspace.scatter'
  | 'editor.tool.inspect'
  | 'editor.tool.grass'
  | 'editor.tool.dirt'
  | 'editor.tool.sand'
  | 'editor.tool.stone'
  | 'editor.tool.cave_floor'
  | 'editor.tool.water'
  | 'editor.tool.path'
  | 'editor.tool.raise'
  | 'editor.tool.lower'
  | 'editor.tool.set_elevation'
  | 'editor.tool.flatten'
  | 'editor.tool.transition'
  | 'editor.tool.ledge'
  | 'editor.tool.erase_ledge'
  | 'editor.tool.override'
  | 'editor.tool.block'
  | 'editor.layer.ground'
  | 'editor.layer.objects'
  | 'editor.layer.gameplay'
  | 'editor.layer.canopy'
  | 'editor.object.prefab'
  | 'editor.object.clone'
  | 'editor.object.delete'
  | 'editor.object.hide'
  | 'editor.object.show'
  | 'editor.object.rotate'
  | 'editor.object.flip'
  | 'editor.object.scale'
  | 'editor.command.undo'
  | 'editor.command.redo'
  | 'editor.command.save'
  | 'editor.command.load'
  | 'editor.command.export'
  | 'editor.command.import'
  | 'editor.command.randomize'
  | 'editor.command.connect_live'
  | 'editor.command.publish_live'
  | 'editor.display.grid'
  | 'editor.display.height'
  | 'editor.display.collision'
  | 'editor.display.auto_edges'
  | 'editor.display.visibility'
  | 'editor.display.layers';

interface EditorIconBase {
  readonly label: string;
  readonly provenance: 'orchard' | 'cute_fantasy' | 'lucide';
}

export interface GeneratedEditorIcon extends EditorIconBase {
  readonly kind: 'generated';
  readonly asset: string;
  readonly group: string;
  readonly variantIndex?: number;
}

export interface UiSymbolEditorIcon extends EditorIconBase {
  readonly kind: 'ui_symbol';
  readonly symbol: UiIconName;
}

export type EditorIconDefinition = GeneratedEditorIcon | UiSymbolEditorIcon;

/**
 * Stable semantic icon boundary shared by every editor route. Screens consume
 * these ids rather than selecting atlas cells or SVG filenames independently.
 */
export const EDITOR_ICONS = {
  'editor.route.map': {
    kind: 'generated', label: 'Map Editor', provenance: 'orchard',
    asset: 'icon_skill_cartographer', group: 'base',
  },
  'editor.route.object': {
    kind: 'generated', label: 'Object Studio', provenance: 'cute_fantasy',
    asset: 'icon_cf_hammer', group: 'base',
  },
  'editor.route.ui_lab': {
    kind: 'generated', label: 'UI Lab', provenance: 'cute_fantasy',
    asset: 'ui_cf_icon_catalog', group: 'catalog', variantIndex: 41,
  },
  'editor.route.character': {
    kind: 'generated', label: 'Character Studio', provenance: 'cute_fantasy',
    asset: 'ui_cf_equipment_slot_icons', group: 'body',
  },
  'editor.route.items': {
    kind: 'generated', label: 'Item & Recipe Studio', provenance: 'cute_fantasy',
    asset: 'ui_cf_icon_catalog', group: 'catalog', variantIndex: 31,
  },
  'editor.workspace.terrain': {
    kind: 'ui_symbol', label: 'Terrain tools', provenance: 'lucide', symbol: 'map',
  },
  'editor.workspace.objects': {
    kind: 'ui_symbol', label: 'Object placement tools', provenance: 'lucide', symbol: 'box',
  },
  'editor.workspace.biomes': {
    kind: 'ui_symbol', label: 'Biome painting tools', provenance: 'lucide', symbol: 'palette',
  },
  'editor.workspace.scatter': {
    kind: 'ui_symbol', label: 'Procedural scatter tools', provenance: 'lucide', symbol: 'randomize',
  },
  'editor.tool.inspect': {
    kind: 'ui_symbol', label: 'Inspect and select', provenance: 'lucide', symbol: 'pointer',
  },
  'editor.tool.grass': {
    kind: 'ui_symbol', label: 'Paint grass', provenance: 'lucide', symbol: 'sprout',
  },
  'editor.tool.dirt': {
    kind: 'ui_symbol', label: 'Paint dirt', provenance: 'lucide', symbol: 'brush',
  },
  'editor.tool.sand': {
    kind: 'ui_symbol', label: 'Paint sand', provenance: 'lucide', symbol: 'landPlot',
  },
  'editor.tool.stone': {
    kind: 'ui_symbol', label: 'Paint stone', provenance: 'lucide', symbol: 'pickaxe',
  },
  'editor.tool.cave_floor': {
    kind: 'ui_symbol', label: 'Paint cave floor', provenance: 'lucide', symbol: 'cave',
  },
  'editor.tool.water': {
    kind: 'ui_symbol', label: 'Paint water', provenance: 'lucide', symbol: 'waves',
  },
  'editor.tool.path': {
    kind: 'ui_symbol', label: 'Paint path', provenance: 'lucide', symbol: 'route',
  },
  'editor.tool.raise': {
    kind: 'ui_symbol', label: 'Raise terrain', provenance: 'lucide', symbol: 'mountain',
  },
  'editor.tool.lower': {
    kind: 'ui_symbol', label: 'Lower terrain', provenance: 'lucide', symbol: 'moveDown',
  },
  'editor.tool.set_elevation': {
    kind: 'ui_symbol', label: 'Set elevation', provenance: 'lucide', symbol: 'level',
  },
  'editor.tool.flatten': {
    kind: 'ui_symbol', label: 'Flatten terrain', provenance: 'lucide', symbol: 'flatten',
  },
  'editor.tool.transition': {
    kind: 'ui_symbol', label: 'Place stairs or ramps', provenance: 'lucide', symbol: 'stairs',
  },
  'editor.tool.ledge': {
    kind: 'ui_symbol', label: 'Draw ledge', provenance: 'lucide', symbol: 'penTool',
  },
  'editor.tool.erase_ledge': {
    kind: 'ui_symbol', label: 'Erase ledge', provenance: 'lucide', symbol: 'eraser',
  },
  'editor.tool.override': {
    kind: 'ui_symbol', label: 'Replace terrain piece', provenance: 'lucide', symbol: 'replace',
  },
  'editor.tool.block': {
    kind: 'ui_symbol', label: 'Collision override', provenance: 'lucide', symbol: 'collision',
  },
  'editor.layer.ground': {
    kind: 'ui_symbol', label: 'Ground layer', provenance: 'lucide', symbol: 'landPlot',
  },
  'editor.layer.objects': {
    kind: 'ui_symbol', label: 'World object layer', provenance: 'lucide', symbol: 'box',
  },
  'editor.layer.gameplay': {
    kind: 'ui_symbol', label: 'Gameplay object layer', provenance: 'lucide', symbol: 'gamepad',
  },
  'editor.layer.canopy': {
    kind: 'ui_symbol', label: 'Canopy layer', provenance: 'lucide', symbol: 'trees',
  },
  'editor.object.prefab': {
    kind: 'ui_symbol', label: 'Prefab', provenance: 'lucide', symbol: 'package',
  },
  'editor.object.clone': {
    kind: 'ui_symbol', label: 'Clone object', provenance: 'lucide', symbol: 'copy',
  },
  'editor.object.delete': {
    kind: 'ui_symbol', label: 'Delete object', provenance: 'lucide', symbol: 'trash',
  },
  'editor.object.hide': {
    kind: 'ui_symbol', label: 'Hide object', provenance: 'lucide', symbol: 'eyeOff',
  },
  'editor.object.show': {
    kind: 'ui_symbol', label: 'Show object', provenance: 'lucide', symbol: 'visibility',
  },
  'editor.object.rotate': {
    kind: 'ui_symbol', label: 'Rotate object', provenance: 'lucide', symbol: 'rotate',
  },
  'editor.object.flip': {
    kind: 'ui_symbol', label: 'Flip object', provenance: 'lucide', symbol: 'flip',
  },
  'editor.object.scale': {
    kind: 'ui_symbol', label: 'Toggle object scale', provenance: 'lucide', symbol: 'scale',
  },
  'editor.command.undo': {
    kind: 'ui_symbol', label: 'Undo', provenance: 'lucide', symbol: 'undo',
  },
  'editor.command.redo': {
    kind: 'ui_symbol', label: 'Redo', provenance: 'lucide', symbol: 'redo',
  },
  'editor.command.save': {
    kind: 'ui_symbol', label: 'Save local draft', provenance: 'lucide', symbol: 'save',
  },
  'editor.command.load': {
    kind: 'ui_symbol', label: 'Load local draft', provenance: 'lucide', symbol: 'load',
  },
  'editor.command.export': {
    kind: 'ui_symbol', label: 'Export document', provenance: 'lucide', symbol: 'export',
  },
  'editor.command.import': {
    kind: 'ui_symbol', label: 'Import document', provenance: 'lucide', symbol: 'import',
  },
  'editor.command.randomize': {
    kind: 'ui_symbol', label: 'Randomize seed', provenance: 'lucide', symbol: 'randomize',
  },
  'editor.command.connect_live': {
    kind: 'ui_symbol', label: 'Connect to live map', provenance: 'lucide', symbol: 'cloudConnect',
  },
  'editor.command.publish_live': {
    kind: 'ui_symbol', label: 'Publish live map revision', provenance: 'lucide', symbol: 'cloudPublish',
  },
  'editor.display.grid': {
    kind: 'ui_symbol', label: 'Grid visibility', provenance: 'lucide', symbol: 'grid',
  },
  'editor.display.height': {
    kind: 'ui_symbol', label: 'Height overlay', provenance: 'lucide', symbol: 'height',
  },
  'editor.display.collision': {
    kind: 'ui_symbol', label: 'Collision overlay', provenance: 'lucide', symbol: 'collision',
  },
  'editor.display.auto_edges': {
    kind: 'ui_symbol', label: 'Automatic terrain edges', provenance: 'lucide', symbol: 'autoEdges',
  },
  'editor.display.visibility': {
    kind: 'ui_symbol', label: 'Layer visibility', provenance: 'lucide', symbol: 'visibility',
  },
  'editor.display.layers': {
    kind: 'ui_symbol', label: 'Content layers', provenance: 'lucide', symbol: 'layers',
  },
} as const satisfies Readonly<Record<EditorIconId, EditorIconDefinition>>;

export function editorIcon(id: EditorIconId): EditorIconDefinition {
  return EDITOR_ICONS[id];
}

export function editorUiSymbol(id: EditorIconId): UiIconName {
  const definition = editorIcon(id);
  if (definition.kind !== 'ui_symbol') {
    throw new Error(`Editor icon ${id} is not a UI symbol`);
  }
  return definition.symbol;
}
