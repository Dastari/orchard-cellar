import {
  CURRENT_BEHAVIOUR_ENGINE_VERSION,
  type ObjectContentDefinition,
} from '@orchard/sim';
import { CanvasTextEditor } from '@orchard/ui';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import {
  canvasAction,
  canvasLabel,
  canvasPanel,
  canvasParts,
  canvasRows,
  canvasSlots,
  finishCanvasTool,
  reportCanvasError,
} from '../build-canvas-common.js';
import {
  objectBehaviourAccessForConnection,
  objectBehaviourPublishAdapterFromConnection,
  objectDefinitionsFromConnection,
  registryDefinitionsFromConnection,
} from './behaviour/connection.js';
import { createObjectBehaviourModel, type ObjectBehaviourModel } from './behaviour/model.js';
import { OBJECT_STUDIO_LAYERS, ObjectStudioModel } from './model.js';

const untitledObject = (): ObjectContentDefinition => ({
  id: 'object:untitled', kind: 'object', schemaVersion: 1, displayName: 'Untitled Object',
  components: {
    identity: { tags: [] }, states: { active: { type: 'bool', default: false } }, interactions: [],
  },
});

interface ObjectCanvasState {
  readonly prefab: ObjectStudioModel;
  readonly behaviour: ObjectBehaviourModel;
  readonly json: CanvasTextEditor;
  mode: 'prefab' | 'behaviour';
  graphNodeId: string | null;
  nextPlacement: number;
  mutationSequence: number;
}

function createState(context: StudioCanvasToolContext): ObjectCanvasState {
  const live = context.controller.liveAdapter();
  const view = live?.view();
  const definitions = view === undefined ? [] : objectDefinitionsFromConnection(view);
  const definition = definitions[0] ?? untitledObject();
  const access = objectBehaviourAccessForConnection(context.route.access, live);
  const behaviour = createObjectBehaviourModel({
    definition, access,
    baseRevision: view?.contentHead?.revision ?? 0n,
    headEngineVersion: view?.contentHead?.engineVersion ?? CURRENT_BEHAVIOUR_ENGINE_VERSION,
    ...(view === undefined ? {} : { registryDefinitions: registryDefinitionsFromConnection(view) }),
    ...(access === 'write' && live !== null ? { createPublishAdapter: () => {
      const adapter = objectBehaviourPublishAdapterFromConnection(live);
      if (adapter === null) throw new Error('object_behaviour_publish_unavailable');
      return adapter;
    } } : {}),
  });
  return {
    prefab: new ObjectStudioModel('untitled-layout', {
      selection: context.controller.selection,
      inspector: context.controller.inspector,
      validation: context.controller.validation,
    }, null),
    behaviour,
    json: new CanvasTextEditor({ maxLength: 32_000, multiline: true }),
    mode: 'prefab', graphNodeId: null, nextPlacement: 1, mutationSequence: 0,
  };
}

function prefabSurface(context: StudioCanvasToolContext, state: ObjectCanvasState,
  parts: ReturnType<typeof canvasParts>, controlsBounds: ReturnType<typeof canvasPanel>,
  workspaceBounds: ReturnType<typeof canvasPanel>): void {
  const model = state.prefab;
  const workspace = model.workspace();
  const shell = canvasSlots(controlsBounds, [
    { id: 'toolbar', minSize: { width: 0, height: 128 }, main: { mode: 'fixed', size: 128 } },
    { id: 'layers', minSize: { width: 0, height: 90 }, main: { mode: 'grow', min: 90 } },
  ], { gap: 6 });
  const tools = canvasSlots(shell['toolbar']!, [
    { id: 'stamp', minSize: { width: 40, height: 40 }, main: { mode: 'fit', preferred: 64, min: 40 } },
    { id: 'group', minSize: { width: 40, height: 40 }, main: { mode: 'fit', preferred: 64, min: 40 } },
    { id: 'left', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
    { id: 'right', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
    { id: 'rotate', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
    ...OBJECT_STUDIO_LAYERS.map((id) => ({ id, minSize: { width: 64, height: 40 }, main: { mode: 'grow' as const, min: 64 } })),
  ], { direction: 'row', gap: 4, wrap: true });
  canvasAction(parts, 'prefab-stamp', 'Stamp sample object piece', tools['stamp']!, () => {
    const ordinal = state.nextPlacement++;
    model.stamp({ id: `sample-${ordinal}`, assetId: 0, assetName: 'studio_sample',
      visual: { kind: 'state', name: 'default', frameIndex: 0 }, tileX: 3 + ordinal, tileY: 4,
      elevation: 0, layer: model.activeLayer(), quarterTurns: 0, flipX: false });
    context.invalidate();
  }, { glyph: '+ STAMP', tone: 'success' });
  canvasAction(parts, 'prefab-group', 'Group selected pieces', tools['group']!, () => {
    if (model.selectedIds().length === 0) return;
    model.group(`group_${model.workspace().revision + 1}`, 'Canvas Group'); context.invalidate();
  }, { glyph: 'GROUP', disabled: model.selectedIds().length === 0 });
  const selected = model.selectedIds()[0];
  canvasAction(parts, 'prefab-left', 'Move selected piece left', tools['left']!, () => {
    if (selected !== undefined) model.move(selected, -1, 0); context.invalidate();
  }, { glyph: '←', disabled: selected === undefined });
  canvasAction(parts, 'prefab-right', 'Move selected piece right', tools['right']!, () => {
    if (selected !== undefined) model.move(selected, 1, 0); context.invalidate();
  }, { glyph: '→', disabled: selected === undefined });
  canvasAction(parts, 'prefab-rotate', 'Rotate selected piece clockwise', tools['rotate']!, () => {
    if (selected !== undefined) model.transform(selected, 'rotate_clockwise'); context.invalidate();
  }, { glyph: '↻', disabled: selected === undefined });
  OBJECT_STUDIO_LAYERS.forEach((layer) => canvasAction(parts, `prefab-layer-${layer}`, `Target ${layer} layer`, tools[layer]!, () => {
    model.selectLayer(layer); context.invalidate();
  }, { role: 'tab', glyph: layer.toUpperCase(), active: model.activeLayer() === layer }));

  const layerBody = canvasPanel(parts, 'prefab-layers-panel', shell['layers']!, 'thin', 3);
  const pieceBody = workspaceBounds;
  const layerSlots = canvasSlots(layerBody, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'rows', minSize: { width: 0, height: 40 }, main: { mode: 'grow', min: 36 } },
    { id: 'status', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 4 });
  canvasLabel(parts, 'prefab-layers-title', 'PREFAB LAYERS', layerSlots['title']!, { heading: true });
  const layerRows = canvasRows(layerSlots['rows']!, OBJECT_STUDIO_LAYERS.length, 40, 4);
  OBJECT_STUDIO_LAYERS.slice(0, layerRows.length).forEach((layer, index) => canvasAction(parts,
    `prefab-visible-${layer}`, `${model.layerVisible(layer) ? 'Hide' : 'Show'} ${layer}`,
    layerRows[index]!, () => { model.toggleLayer(layer); context.invalidate(); },
    { glyph: `${model.layerVisible(layer) ? '◉' : '○'} ${layer}`, active: model.layerVisible(layer) }));
  canvasLabel(parts, 'prefab-status', `${workspace.width}×${workspace.height} · REV ${workspace.revision}`,
    layerSlots['status']!, { field: true });
  const pieceSlots = canvasSlots(pieceBody, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'rows', minSize: { width: 0, height: 40 }, main: { mode: 'grow', min: 36 } },
  ], { gap: 4 });
  canvasLabel(parts, 'prefab-pieces-title', `PIECES · ${workspace.placements.length}`, pieceSlots['title']!, { heading: true });
  const pieceRows = canvasRows(pieceSlots['rows']!, Math.max(1, workspace.placements.length), 40, 4);
  if (workspace.placements.length === 0) canvasLabel(parts, 'prefab-empty', 'EMPTY · USE + STAMP', pieceRows[0]!, { field: true });
  workspace.placements.slice(0, pieceRows.length).forEach((piece, index) => canvasAction(parts,
    `prefab-piece-${piece.id}`, `Select prefab piece ${piece.id}`, pieceRows[index]!, () => {
      model.select(piece.id); context.invalidate();
    }, { role: 'option', glyph: `${piece.id} · ${piece.layer} · ${piece.tileX},${piece.tileY}`,
      active: model.selectedIds().includes(piece.id) }));
}

function behaviourSurface(context: StudioCanvasToolContext, state: ObjectCanvasState,
  parts: ReturnType<typeof canvasParts>, controlsBounds: ReturnType<typeof canvasPanel>,
  workspaceBounds: ReturnType<typeof canvasPanel>): void {
  const snapshot = state.behaviour.snapshot();
  if (!state.json.snapshot().focused && state.json.snapshot().value.length === 0) {
    state.json.setValue(JSON.stringify(snapshot.definition, null, 2));
  }
  const shell = canvasSlots(controlsBounds, [
    { id: 'toolbar', minSize: { width: 0, height: 172 }, main: { mode: 'fixed', size: 172 } },
    { id: 'details', minSize: { width: 0, height: 90 }, main: { mode: 'grow', min: 90 } },
  ], { gap: 6 });
  const toolbar = canvasSlots(shell['toolbar']!, [
    { id: 'status', minSize: { width: 130, height: 40 }, main: { mode: 'grow', min: 130 } },
    { id: 'add', minSize: { width: 64, height: 40 }, main: { mode: 'fit', preferred: 118, min: 64 } },
    { id: 'json', minSize: { width: 52, height: 40 }, main: { mode: 'fit', preferred: 90, min: 52 } },
    { id: 'apply', minSize: { width: 52, height: 40 }, main: { mode: 'fit', preferred: 90, min: 52 } },
    { id: 'publish', minSize: { width: 64, height: 40 }, main: { mode: 'fit', preferred: 104, min: 64 } },
  ], { direction: 'row', gap: 4, wrap: true });
  canvasLabel(parts, 'behaviour-status', `${snapshot.definition.displayName} · ${snapshot.nodes.length} NODES · ${snapshot.engineGate}`,
    toolbar['status']!, { field: true, tone: snapshot.validation.valid ? 'success' : 'danger' });
  canvasAction(parts, 'behaviour-add', 'Add use interaction', toolbar['add']!, () => {
    try {
      const ordinal = (state.behaviour.snapshot().definition.components.interactions?.length ?? 0) + 1;
      state.behaviour.addInteraction({ id: `interaction_${ordinal}`, verb: 'use', prompt: 'USE',
        conditions: [{ reach: 'object' }], effects: [{ toggleState: 'active' }] });
      state.json.setValue(JSON.stringify(state.behaviour.snapshot().definition, null, 2)); context.invalidate();
    } catch (error) { reportCanvasError(context, 'Interaction rejected', error); }
  }, { glyph: '+ INTERACT', disabled: snapshot.access === 'read_only', tone: 'success' });
  canvasAction(parts, 'behaviour-json', 'Edit object JSON', toolbar['json']!, () => state.json.focus(),
    { role: 'textbox', glyph: '{ }', disabled: snapshot.access === 'read_only' });
  canvasAction(parts, 'behaviour-apply', 'Apply object JSON', toolbar['apply']!, () => {
    try { state.behaviour.replaceDefinition(state.json.snapshot().value); context.invalidate(); }
    catch (error) { reportCanvasError(context, 'Object definition rejected', error); }
  }, { glyph: 'APPLY', disabled: snapshot.access === 'read_only' });
  canvasAction(parts, 'behaviour-publish', 'Publish object behaviour', toolbar['publish']!, () => {
    state.mutationSequence += 1;
    void state.behaviour.publish(`object.canvas.${state.mutationSequence}`, 'Canvas object behaviour')
      .then(() => context.controller.notifications.push('success', 'Behaviour published', snapshot.definition.id))
      .catch((error: unknown) => reportCanvasError(context, 'Behaviour publish failed', error)).finally(context.invalidate);
  }, { glyph: 'PUBLISH', disabled: !snapshot.canPublish, tone: 'success' });
  const graph = workspaceBounds;
  const details = canvasPanel(parts, 'behaviour-details-panel', shell['details']!, 'thin', 3);
  const graphSlots = canvasSlots(graph, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'nodes', minSize: { width: 0, height: 40 }, main: { mode: 'grow', min: 36 } },
  ], { gap: 4 });
  canvasLabel(parts, 'behaviour-graph-title', 'TRIGGER → CONDITIONS → EFFECTS', graphSlots['title']!, { heading: true });
  const graphRows = canvasRows(graphSlots['nodes']!, Math.max(1, snapshot.nodes.length), 40, 5);
  if (snapshot.nodes.length === 0) canvasLabel(parts, 'behaviour-empty', 'NO INTERACTIONS', graphRows[0]!, { field: true });
  snapshot.nodes.slice(0, graphRows.length).forEach((node, index) => canvasAction(parts, `behaviour-node-${node.id}`,
    `Inspect ${node.kind} ${node.label}`, graphRows[index]!, () => { state.graphNodeId = node.id; context.invalidate(); },
    { role: 'option', glyph: `${node.kind.toUpperCase()} · ${node.label}`, active: state.graphNodeId === node.id }));
  const selected = snapshot.nodes.find(({ id }) => id === state.graphNodeId);
  const detailSlots = canvasSlots(details, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'summary', minSize: { width: 0, height: 80 }, main: { mode: 'grow', min: 80 } },
    { id: 'remove', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 5 });
  canvasLabel(parts, 'behaviour-details-title', 'NODE INSPECTOR', detailSlots['title']!, { heading: true });
  canvasLabel(parts, 'behaviour-details', selected === undefined ? 'SELECT A GRAPH NODE'
    : `${selected.kind.toUpperCase()}\n${selected.label}\nORDER ${selected.order}`,
  detailSlots['summary']!, { field: true });
  canvasAction(parts, 'behaviour-remove', 'Remove selected graph node', detailSlots['remove']!, () => {
    if (selected === undefined || selected.kind === 'trigger') return;
    try { state.behaviour.removeNode(selected.id); state.graphNodeId = null; context.invalidate(); }
    catch (error) { reportCanvasError(context, 'Graph node removal failed', error); }
  }, { glyph: '− NODE', disabled: selected === undefined || selected.kind === 'trigger' || snapshot.access === 'read_only', tone: 'danger' });
  parts.textEditors.push({ id: 'behaviour-json', editor: state.json });
  context.controller.validation.setIssues([
    ...snapshot.validation.errors.map((issue, index) => ({ id: `object:error:${index}`, severity: 'error' as const, message: issue.message })),
    ...snapshot.validation.warnings.map((issue, index) => ({ id: `object:warning:${index}`, severity: 'warning' as const, message: issue.message })),
  ]);
}

export function buildObjectCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const state = context.controller.toolState('object-canvas', () => createState(context));
  state.prefab.refreshKernels();
  context.controller.setWorldDraft('object:untitled-layout', state.prefab.worldOutliner());
  const parts = canvasParts();
  const controlsBody = context.controlsBounds ?? context.bounds;
  const workspaceBody = context.workspaceBounds ?? context.bounds;
  const shell = canvasSlots(controlsBody, [
    { id: 'tabs', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
    { id: 'surface', minSize: { width: 0, height: 90 }, main: { mode: 'grow', min: 90 } },
  ], { gap: 6 });
  const tabs = canvasSlots(shell['tabs']!, [
    { id: 'prefab', minSize: { width: 88, height: 40 }, main: { mode: 'grow', min: 88 } },
    { id: 'behaviour', minSize: { width: 88, height: 40 }, main: { mode: 'grow', min: 88 } },
  ], { direction: 'row', gap: 5 });
  for (const mode of ['prefab', 'behaviour'] as const) canvasAction(parts, `mode-${mode}`, `Open ${mode} workspace`, tabs[mode]!, () => {
    state.mode = mode; context.invalidate();
  }, { role: 'tab', glyph: mode.toUpperCase(), active: state.mode === mode });
  if (state.mode === 'prefab') prefabSurface(context, state, parts, shell['surface']!, workspaceBody);
  else behaviourSurface(context, state, parts, shell['surface']!, workspaceBody);
  return finishCanvasTool(context, parts, (drawing) => {
    drawing.save();
    if (state.mode === 'prefab') {
      const workspace = state.prefab.workspace();
      const tile = Math.max(8, Math.min(24, Math.floor(Math.min(
        workspaceBody.width / Math.min(24, workspace.width), workspaceBody.height / Math.min(18, workspace.height),
      ))));
      if (context.controller.gridVisible()) {
        drawing.strokeStyle = 'rgba(255, 255, 255, 0.52)'; drawing.lineWidth = 1;
        for (let x = workspaceBody.x; x <= workspaceBody.x + workspaceBody.width; x += tile) {
          drawing.beginPath(); drawing.moveTo(x, workspaceBody.y); drawing.lineTo(x, workspaceBody.y + workspaceBody.height); drawing.stroke();
        }
        for (let y = workspaceBody.y; y <= workspaceBody.y + workspaceBody.height; y += tile) {
          drawing.beginPath(); drawing.moveTo(workspaceBody.x, y); drawing.lineTo(workspaceBody.x + workspaceBody.width, y); drawing.stroke();
        }
      }
      for (const piece of workspace.placements.slice(0, 120)) {
        drawing.fillStyle = state.prefab.selectedIds().includes(piece.id) ? '#fff2a8' : '#d7a95a';
        drawing.fillRect(workspaceBody.x + piece.tileX * tile + 2, workspaceBody.y + piece.tileY * tile + 2,
          Math.max(4, tile - 4), Math.max(4, tile - 4));
      }
    } else {
      const nodes = state.behaviour.snapshot().nodes.slice(0, 24);
      const laneHeight = Math.max(42, Math.floor(workspaceBody.height / Math.max(1, nodes.length)));
      nodes.forEach((node, index) => {
        const x = workspaceBody.x + 24 + (node.kind === 'condition' ? 34 : node.kind === 'effect' ? 68 : 0);
        const y = workspaceBody.y + 12 + index * laneHeight;
        const width = Math.max(100, workspaceBody.width - 116);
        if (index > 0) {
          drawing.strokeStyle = '#cfb576'; drawing.beginPath();
          drawing.moveTo(x + 12, y - Math.max(6, laneHeight - 8)); drawing.lineTo(x + 12, y); drawing.stroke();
        }
        drawing.fillStyle = node.kind === 'trigger' ? '#8c6246' : node.kind === 'condition' ? '#496c77' : '#587650';
        drawing.fillRect(x, y, width, Math.max(30, laneHeight - 8));
        drawing.fillStyle = '#fff3cf'; drawing.font = '12px monospace';
        drawing.fillText(`${node.kind.toUpperCase()} · ${node.label}`.slice(0, 62), x + 8, y + 20);
      });
    }
    drawing.restore();
  });
}
