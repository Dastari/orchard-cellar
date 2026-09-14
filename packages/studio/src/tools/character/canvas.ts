import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import {
  canvasAction,
  canvasLabel,
  canvasPanel,
  canvasParts,
  canvasRows,
  canvasSlots,
  finishCanvasTool,
} from '../build-canvas-common.js';
import {
  CharacterStudioModel,
  STUDIO_EQUIPMENT_ITEMS,
  equipmentPalette,
  type StudioAction,
  type StudioEquipmentSlot,
} from './model.js';

const ACTIONS: readonly StudioAction[] = ['swing_sword', 'swing_pickaxe', 'swing_axe', 'ranged_weapon'];
const FACINGS = ['down', 'left', 'up', 'right'] as const;
const SLOTS: readonly StudioEquipmentSlot[] = ['head', 'body', 'legs'];
const CANVAS_ARMOUR_ASSETS = Object.freeze([
  'wearable_cf_plate_helmet', 'wearable_cf_heavy_plate_helmet',
  'wearable_cf_plate_chest', 'wearable_cf_plate_legs',
] as const);
const CANVAS_TOOL_ASSETS = Object.freeze([
  'tool_cf_iron_sword_action', 'tool_cf_iron_pickaxe_action',
  'tool_cf_iron_axe_action', 'tool_cf_wooden_bow_action',
] as const);

/** Total generated rig coverage retained by the canvas-native Character tool. */
export function characterRigAssetIds(): readonly string[] {
  const catalogs: readonly (readonly PlayerRigAssetEntry[])[] = [
    PLAYER_RIG_HAIR_ASSETS, PLAYER_RIG_PANTS_ASSETS, PLAYER_RIG_SHIRT_ASSETS, PLAYER_RIG_SHOE_ASSETS,
  ];
  return Object.freeze([
    ...Object.values(PLAYER_RIG_CORE_ASSETS).flat(),
    ...catalogs.flatMap((entries) => entries.flatMap(([, ...assets]) => assets)),
    ...CANVAS_ARMOUR_ASSETS,
    ...CANVAS_TOOL_ASSETS,
  ]);
}

export function characterRigAudit(): readonly string[] {
  const missing = characterRigAssetIds().filter((id) => id.trim().length === 0);
  const catalogs: readonly (readonly PlayerRigAssetEntry[])[] = [
    PLAYER_RIG_HAIR_ASSETS, PLAYER_RIG_PANTS_ASSETS, PLAYER_RIG_SHIRT_ASSETS, PLAYER_RIG_SHOE_ASSETS,
  ];
  for (const entries of catalogs) for (const [appearance] of entries) {
    try { playerRigAssetEntry(entries, appearance); } catch { missing.push(appearance); }
  }
  return Object.freeze(missing);
}

interface CharacterCanvasState {
  readonly model: CharacterStudioModel;
  slot: StudioEquipmentSlot;
}

export function buildCharacterCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const state = context.controller.toolState<CharacterCanvasState>('character-canvas', () => ({
    model: new CharacterStudioModel(), slot: 'head',
  }));
  const snapshot = state.model.snapshot();
  const parts = canvasParts();
  context.controller.validation.setIssues(characterRigAudit().map((id) => ({
    id: `rig:${id}`, severity: 'error' as const, message: `Missing rig asset ${id}`,
  })));
  const controlsBody = context.controlsBounds ?? context.bounds;
  const workspaceBody = context.workspaceBounds ?? context.bounds;
  const shell = canvasSlots(controlsBody, [
    { id: 'header', minSize: { width: 0, height: 84 }, main: { mode: 'fixed', size: 84 } },
    { id: 'actions', minSize: { width: 0, height: 84 }, main: { mode: 'fixed', size: 84 } },
    { id: 'facing', minSize: { width: 0, height: 84 }, main: { mode: 'fixed', size: 84 } },
    { id: 'content', minSize: { width: 0, height: 80 }, main: { mode: 'grow', min: 80 } },
  ], { gap: 6 });
  const header = canvasSlots(shell['header']!, [
    { id: 'title', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
    { id: 'status', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 4 });
  canvasLabel(parts, 'title', 'LAYERED CHARACTER RIG', header['title']!, { heading: true });
  canvasLabel(parts, 'status', `${snapshot.action.toUpperCase()} · FACE ${snapshot.facing.toUpperCase()}`,
    header['status']!, { field: true });
  const actionSlots = canvasSlots(shell['actions']!, ACTIONS.map((id) => ({
    id, minSize: { width: 74, height: 40 }, main: { mode: 'grow' as const, min: 74 },
  })), { direction: 'row', gap: 4, wrap: true });
  ACTIONS.forEach((action) => canvasAction(parts, `action-${action}`, `Preview ${action.replaceAll('_', ' ')}`,
    actionSlots[action]!, () => {
      state.model.selectAction(action); context.invalidate();
    }, { role: 'tab', glyph: action.replace('swing_', '').replace('_weapon', '').toUpperCase(), active: snapshot.action === action }));
  const facingSlots = canvasSlots(shell['facing']!, FACINGS.map((id) => ({
    id, minSize: { width: 50, height: 40 }, main: { mode: 'fit' as const, preferred: 54, min: 50 },
  })), { direction: 'row', gap: 4, wrap: true });
  FACINGS.forEach((facing) => canvasAction(parts, `facing-${facing}`, `Face ${facing}`,
    facingSlots[facing]!, () => { state.model.face(facing); context.invalidate(); },
    { glyph: ({ down: '↓', left: '←', up: '↑', right: '→' } as const)[facing], active: snapshot.facing === facing }));

  const preview = workspaceBody;
  const equipment = canvasPanel(parts, 'equipment-panel', shell['content']!, 'thin', 3);
  const previewSlots = canvasSlots(preview, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'layers', minSize: { width: 0, height: 40 }, main: { mode: 'grow', min: 34 } },
  ], { gap: 6 });
  canvasLabel(parts, 'preview-title', 'CANVAS RIG PREVIEW', previewSlots['title']!, { heading: true });
  const equipped = state.model.equipped();
  const layerRows = canvasRows(previewSlots['layers']!, 7, 40, 5);
  const layers = [
    `ACTION · ${snapshot.action}`,
    `FACING · ${snapshot.facing}`,
    'BASE · player rig',
    `LEGS · ${equipped[2].name}`,
    `BODY · ${equipped[1].name}`,
    `HEAD · ${equipped[0].name}`,
    `PALETTE · ${equipped.flatMap(equipmentPalette).length} COLOURS`,
  ];
  layers.slice(0, layerRows.length).forEach((label, index) => canvasLabel(parts, `rig-layer-${index}`, label,
    layerRows[index]!, { field: true, tone: index > 2 ? 'success' : 'normal' }));

  const equipmentSlots = canvasSlots(equipment, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'tabs', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
    { id: 'items', minSize: { width: 0, height: 40 }, main: { mode: 'grow', min: 36 } },
  ], { gap: 4 });
  canvasLabel(parts, 'equipment-title', 'EQUIPMENT & PALETTE', equipmentSlots['title']!, { heading: true });
  const slotTabs = canvasSlots(equipmentSlots['tabs']!, SLOTS.map((id) => ({
    id, minSize: { width: 50, height: 40 }, main: { mode: 'grow' as const, min: 50 },
  })), { direction: 'row', gap: 4 });
  SLOTS.forEach((slot) => canvasAction(parts, `slot-${slot}`, `Edit ${slot} equipment`,
    slotTabs[slot]!, () => {
      state.slot = slot; context.invalidate();
    }, { role: 'tab', glyph: slot.toUpperCase(), active: state.slot === slot }));
  const candidates = STUDIO_EQUIPMENT_ITEMS.filter(({ slot }) => slot === state.slot);
  const candidateRows = canvasRows(equipmentSlots['items']!, candidates.length, 40, 4);
  candidates.slice(0, candidateRows.length).forEach((item, index) => canvasAction(parts, `equipment-${item.id}`,
    `Equip ${item.name}`, candidateRows[index]!, () => { state.model.equip(item.id); context.invalidate(); }, {
      role: 'option', glyph: `${item.name} · ${equipmentPalette(item).join(' ')}`,
      active: snapshot.equipment[state.slot] === item.id,
    }));
  return finishCanvasTool(context, parts, (drawing) => {
    const current = state.model.snapshot();
    const [head, torso, legs] = state.model.equipped();
    const centerX = workspaceBody.x + workspaceBody.width / 2;
    const centerY = workspaceBody.y + workspaceBody.height / 2;
    const scale = Math.max(3, Math.min(8, Math.floor(Math.min(workspaceBody.width, workspaceBody.height) / 48)));
    const block = (x: number, y: number, width: number, height: number, color: string): void => {
      drawing.fillStyle = color; drawing.fillRect(Math.round(centerX + x * scale), Math.round(centerY + y * scale), width * scale, height * scale);
    };
    drawing.save(); drawing.imageSmoothingEnabled = false;
    drawing.fillStyle = '#263a31'; drawing.beginPath(); drawing.ellipse(centerX, centerY + 15 * scale, 11 * scale, 3 * scale, 0, 0, Math.PI * 2); drawing.fill();
    block(-5, -13, 10, 8, equipmentPalette(head)[2] ?? '#8e9ab4');
    block(-7, -5, 14, 11, equipmentPalette(torso)[1] ?? '#6c7c9d');
    block(-6, 6, 5, 9, equipmentPalette(legs)[1] ?? '#6c7c9d');
    block(1, 6, 5, 9, equipmentPalette(legs)[2] ?? '#8e9ab4');
    const toolSide = current.facing === 'left' ? -13 : 9;
    block(toolSide, -3, 3, 15, current.action === 'ranged_weapon' ? '#b97a42' : '#d7d4c8');
    drawing.fillStyle = '#fff3cf'; drawing.font = '14px monospace'; drawing.textAlign = 'center';
    drawing.fillText(`${current.action.replaceAll('_', ' ').toUpperCase()} · ${current.facing.toUpperCase()}`,
      centerX, workspaceBody.y + workspaceBody.height - 18);
    drawing.restore();
  });
}
import {
  PLAYER_RIG_CORE_ASSETS,
  PLAYER_RIG_HAIR_ASSETS,
  PLAYER_RIG_PANTS_ASSETS,
  PLAYER_RIG_SHIRT_ASSETS,
  PLAYER_RIG_SHOE_ASSETS,
  playerRigAssetEntry,
  type PlayerRigAssetEntry,
} from '@orchard/engine/player-rig-assets';
