import {
  bootstrapContentDefinitions,
  parseContentDefinition,
  type SupportedContentDefinition,
  type TilesetContentDefinition,
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
import { createTileEditorModel, type TileEditorAccess, type TileEditorModel } from './model.js';

interface TilesCanvasState {
  model: TileEditorModel;
  readonly definitions: readonly SupportedContentDefinition[];
  readonly tilesets: readonly TilesetContentDefinition[];
  readonly json: CanvasTextEditor;
  selectedAudition: string | null;
  mutationSequence: number;
}

type LiveContentReadiness = 'offline' | 'loading' | 'unavailable' | 'ready';

function liveContentReadiness(context: StudioCanvasToolContext): LiveContentReadiness {
  const live = context.controller.liveAdapter();
  if (live === null) return 'offline';
  const view = live.view();
  if (view.error !== null || (!view.connected && !view.synchronizing)) return 'unavailable';
  if (view.synchronizing || !view.connected
    || view.contentHead === undefined || view.contentDefinitions === undefined) return 'loading';
  return view.contentHead === null || view.contentDefinitions.length === 0 ? 'unavailable' : 'ready';
}

function contentStatusSurface(
  context: StudioCanvasToolContext,
  readiness: Exclude<LiveContentReadiness, 'offline' | 'ready'>,
): StudioCanvasToolSurface {
  const parts = canvasParts();
  const controls = canvasPanel(parts, 'content-status-controls', context.controlsBounds ?? context.bounds, 'thin', 3);
  const workspace = canvasPanel(parts, 'content-status-workspace', context.workspaceBounds ?? context.bounds, 'thin', 3);
  canvasLabel(parts, 'content-status-title', readiness === 'loading' ? 'LOADING LIVE CONTENT' : 'LIVE CONTENT UNAVAILABLE',
    controls, { heading: true, tone: readiness === 'loading' ? undefined : 'danger' });
  canvasLabel(parts, 'content-status-detail', readiness === 'loading'
    ? 'WAITING FOR VERIFIED LIVE CONTENT' : 'NO VERIFIED LIVE CONTENT HEAD IS AVAILABLE', workspace, { field: true });
  return finishCanvasTool(context, parts);
}

function definitionsFrom(context: StudioCanvasToolContext): readonly SupportedContentDefinition[] {
  const live = context.controller.liveAdapter();
  if (live === null) return bootstrapContentDefinitions();
  return Object.freeze(live.view().contentDefinitions!.map((row) => parseContentDefinition(row.kind, row.json)));
}

function accessFrom(context: StudioCanvasToolContext): TileEditorAccess {
  const live = context.controller.liveAdapter();
  if (live === null || !live.view().connected) return 'anonymous';
  return context.route.access === 'write' ? 'write' : 'read_only';
}

function modelFor(
  context: StudioCanvasToolContext,
  definition: TilesetContentDefinition,
  definitions: readonly SupportedContentDefinition[],
): TileEditorModel {
  const live = context.controller.liveAdapter();
  const access = accessFrom(context);
  return createTileEditorModel({ definition, definitions, access,
    baseRevision: live?.view().contentHead?.revision ?? 0n,
    ...(access === 'write' && live?.publishContentChangeSet !== undefined ? {
      createPublishAdapter: () => ({ publishContentChangeSet: (request) => live.publishContentChangeSet!(request) }),
    } : {}),
  });
}

function createState(context: StudioCanvasToolContext): TilesCanvasState {
  const definitions = definitionsFrom(context);
  const tilesets = definitions.filter((entry): entry is TilesetContentDefinition => entry.kind === 'tileset');
  if (tilesets.length === 0) throw new Error('tile_editor_no_tilesets');
  const model = modelFor(context, tilesets[0]!, definitions);
  return { model, definitions, tilesets, json: new CanvasTextEditor({ maxLength: 32_000, multiline: true }),
    selectedAudition: null, mutationSequence: 0 };
}

export function buildTilesCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const readiness = liveContentReadiness(context);
  if (readiness === 'loading' || readiness === 'unavailable') return contentStatusSurface(context, readiness);
  const view = context.controller.liveAdapter()?.view();
  const sourceKey = view === undefined ? 'offline' : `${view.identity ?? 'anonymous'}:${view.contentHead!.revision}`;
  const state = context.controller.toolState(`tiles-canvas:${sourceKey}`, () => createState(context));
  const snapshot = state.model.snapshot();
  if (state.json.snapshot().value.length === 0) state.json.setValue(JSON.stringify(snapshot.definition, null, 2));
  const parts = canvasParts();
  const controlsBody = context.controlsBounds ?? context.bounds;
  const workspaceBody = context.workspaceBounds ?? context.bounds;
  const shell = canvasSlots(controlsBody, [
    { id: 'header', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
    { id: 'toolbar', minSize: { width: 0, height: 128 }, main: { mode: 'fixed', size: 128 } },
    { id: 'content', minSize: { width: 0, height: 80 }, main: { mode: 'grow', min: 80 } },
  ], { gap: 6 });
  const header = canvasSlots(shell['header']!, [
    { id: 'title', minSize: { width: 80, height: 40 }, main: { mode: 'grow', min: 80 } },
    { id: 'previous', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
    { id: 'next', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
  ], { direction: 'row', gap: 4 });
  canvasLabel(parts, 'title', `${snapshot.definition.familyId.toUpperCase()} TILESET · ${snapshot.access.toUpperCase()}`,
    header['title']!, { heading: true });
  const choose = (offset: number): void => {
    const index = state.tilesets.findIndex(({ id }) => id === state.model.snapshot().definition.id);
    const next = state.tilesets[(index + offset + state.tilesets.length) % state.tilesets.length]!;
    state.model = modelFor(context, next, state.definitions); state.json.setValue(JSON.stringify(next, null, 2));
    state.selectedAudition = null; context.invalidate();
  };
  canvasAction(parts, 'previous', 'Previous tileset family', header['previous']!, () => choose(-1), { glyph: '←' });
  canvasAction(parts, 'next', 'Next tileset family', header['next']!, () => choose(1), { glyph: '→' });
  const toolbar = canvasSlots(shell['toolbar']!, [
    { id: 'projection', minSize: { width: 84, height: 40 }, main: { mode: 'grow', min: 84 } },
    { id: 'datum-down', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
    { id: 'datum-up', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
    { id: 'json', minSize: { width: 52, height: 40 }, main: { mode: 'fit', preferred: 82, min: 52 } },
    { id: 'apply', minSize: { width: 52, height: 40 }, main: { mode: 'fit', preferred: 82, min: 52 } },
    { id: 'publish', minSize: { width: 64, height: 40 }, main: { mode: 'fit', preferred: 100, min: 64 } },
  ], { direction: 'row', gap: 4, wrap: true });
  const readOnly = snapshot.access === 'read_only';
  canvasAction(parts, 'projection', 'Toggle raised or interior projection', toolbar['projection']!, () => {
    state.model.setProjection(snapshot.definition.projectionStyle === 'raised' ? 'interior' : 'raised',
      snapshot.definition.baseDatum, snapshot.definition.faceClearanceRows); context.invalidate();
  }, { glyph: `PROJECTION ${snapshot.definition.projectionStyle.toUpperCase()}`, disabled: readOnly });
  canvasAction(parts, 'datum-down', 'Lower base datum', toolbar['datum-down']!, () => {
    state.model.setProjection(snapshot.definition.projectionStyle, snapshot.definition.baseDatum - 1,
      snapshot.definition.faceClearanceRows); context.invalidate();
  }, { glyph: '−', disabled: readOnly });
  canvasAction(parts, 'datum-up', 'Raise base datum', toolbar['datum-up']!, () => {
    state.model.setProjection(snapshot.definition.projectionStyle, snapshot.definition.baseDatum + 1,
      snapshot.definition.faceClearanceRows); context.invalidate();
  }, { glyph: '+', disabled: readOnly });
  canvasAction(parts, 'json', 'Edit tileset JSON', toolbar['json']!, () => state.json.focus(),
    { role: 'textbox', glyph: '{ }', disabled: readOnly });
  canvasAction(parts, 'apply', 'Apply tileset JSON', toolbar['apply']!, () => {
    try { state.model.replaceDefinition(state.json.snapshot().value); context.invalidate(); }
    catch (error) { reportCanvasError(context, 'Tileset rejected', error); }
  }, { glyph: 'APPLY', disabled: readOnly });
  canvasAction(parts, 'publish', 'Publish tileset family', toolbar['publish']!, () => {
    state.mutationSequence += 1;
    void state.model.publish(`tiles.canvas.${state.mutationSequence}`, 'Canvas tileset edit')
      .then(() => context.controller.notifications.push('success', 'Tileset published', snapshot.definition.id))
      .catch((error: unknown) => reportCanvasError(context, 'Tileset publish failed', error)).finally(context.invalidate);
  }, { glyph: 'PUBLISH', disabled: !snapshot.canPublish, tone: 'success' });

  const auditions = canvasPanel(parts, 'auditions-panel', shell['content']!, 'thin', 3);
  const fixtures = workspaceBody;
  const auditionSlots = canvasSlots(auditions, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'rows', minSize: { width: 0, height: 40 }, main: { mode: 'grow', min: 38 } },
    { id: 'status', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 4 });
  canvasLabel(parts, 'auditions-title', `FRAME AUDITION · ${snapshot.auditions.length}`, auditionSlots['title']!, { heading: true });
  const auditionRows = canvasRows(auditionSlots['rows']!, snapshot.auditions.length, 40, 4);
  snapshot.auditions.slice(0, auditionRows.length).forEach((entry, index) => canvasAction(parts, `audition-${entry.key}`,
    `Inspect frame audition ${entry.key}`, auditionRows[index]!, () => { state.selectedAudition = entry.key; context.invalidate(); },
    { role: 'option', glyph: `${entry.key} · ${entry.assetId} #${entry.frames.join(',')}`, active: state.selectedAudition === entry.key }));
  canvasLabel(parts, 'validation', `${snapshot.validation.errors.length} ERRORS · ${snapshot.validation.warnings.length} WARNINGS · DATUM ${snapshot.definition.baseDatum}`,
    auditionSlots['status']!, { field: true, tone: snapshot.validation.valid ? 'success' : 'danger' });
  const fixtureSlots = canvasSlots(fixtures, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'rows', minSize: { width: 0, height: 42 }, main: { mode: 'grow', min: 42 } },
  ], { gap: 4 });
  canvasLabel(parts, 'fixtures-title', 'TERRAIN TOPOLOGY FIXTURES', fixtureSlots['title']!, { heading: true });
  const fixtureRows = canvasRows(fixtureSlots['rows']!, snapshot.fixtures.length, 46, 5);
  snapshot.fixtures.slice(0, fixtureRows.length).forEach((fixture, index) => canvasLabel(parts, `fixture-${fixture.id}`,
    `${fixture.id} · ${fixture.tileX},${fixture.tileY} · ${fixture.layers.length} LAYERS`, fixtureRows[index]!, { field: true }));
  parts.textEditors.push({ id: 'json', editor: state.json });
  context.controller.validation.setIssues([
    ...snapshot.validation.errors.map((issue, index) => ({ id: `tiles:error:${index}`, severity: 'error' as const, message: issue.message })),
    ...snapshot.validation.warnings.map((issue, index) => ({ id: `tiles:warning:${index}`, severity: 'warning' as const, message: issue.message })),
  ]);
  return finishCanvasTool(context, parts, (drawing) => {
    const target = fixtureSlots['rows']!;
    drawing.save();
    const fixtures = snapshot.fixtures.slice(0, 8);
    const columns = Math.max(1, Math.min(4, fixtures.length));
    const cellWidth = target.width / columns;
    const cellHeight = target.height / Math.max(1, Math.ceil(fixtures.length / columns));
    fixtures.forEach((fixture, index) => {
      const x = target.x + index % columns * cellWidth;
      const y = target.y + Math.floor(index / columns) * cellHeight;
      const colors = ['#688c58', '#8f7654', '#58758c', '#77618c'];
      fixture.layers.slice(0, 4).forEach((layer, layerIndex) => {
        const inset = 7 + layerIndex * 5;
        drawing.fillStyle = colors[layerIndex] ?? '#d7a95a';
        drawing.fillRect(x + inset, y + inset, Math.max(4, cellWidth - inset * 2), Math.max(4, cellHeight - inset * 2));
      });
      drawing.fillStyle = '#fff3cf'; drawing.font = '11px monospace'; drawing.textAlign = 'center';
      drawing.fillText(fixture.id.toUpperCase(), x + cellWidth / 2, y + cellHeight - 8);
    });
    drawing.restore();
  });
}
