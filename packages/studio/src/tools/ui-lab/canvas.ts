import {
  bootstrapContentDefinitions,
  parseContentDefinition,
  type FrameContentDefinition,
  type SupportedContentDefinition,
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
import { createFrameDesignerModel, type FrameDesignerAccess, type FrameDesignerModel } from './frame-designer-model.js';
import { createUiLabSnapshot } from './model.js';

interface UiLabCanvasState {
  readonly lab: ReturnType<typeof createUiLabSnapshot>;
  readonly definitions: readonly SupportedContentDefinition[];
  readonly frames: readonly FrameContentDefinition[];
  frame: FrameDesignerModel;
  readonly json: CanvasTextEditor;
  specimenIndex: number;
  scale: ReturnType<typeof createUiLabSnapshot>['scales'][number];
  paneId: string | null;
  mutationSequence: number;
}

function definitionsFrom(context: StudioCanvasToolContext): readonly SupportedContentDefinition[] {
  const rows = context.controller.liveAdapter()?.view().contentDefinitions;
  return rows === undefined || rows.length === 0 ? bootstrapContentDefinitions()
    : Object.freeze(rows.map((row) => parseContentDefinition(row.kind, row.json)));
}

function accessFrom(context: StudioCanvasToolContext): FrameDesignerAccess {
  const live = context.controller.liveAdapter();
  if (live === null || !live.view().connected) return 'anonymous';
  return context.route.access === 'write' ? 'write' : 'read_only';
}

function frameModel(
  context: StudioCanvasToolContext,
  definition: FrameContentDefinition,
  definitions: readonly SupportedContentDefinition[],
): FrameDesignerModel {
  const live = context.controller.liveAdapter();
  const access = accessFrom(context);
  return createFrameDesignerModel({ definition, definitions, access, viewport: { width: 560, height: 330 },
    baseRevision: live?.view().contentHead?.revision ?? 0n,
    ...(access === 'write' && live?.publishContentChangeSet !== undefined ? {
      createPublishAdapter: () => ({ publishContentChangeSet: (request) => live.publishContentChangeSet!(request) }),
    } : {}),
  });
}

function createState(context: StudioCanvasToolContext): UiLabCanvasState {
  const definitions = definitionsFrom(context);
  const frames = definitions.filter((entry): entry is FrameContentDefinition => entry.kind === 'frame');
  if (frames.length === 0) throw new Error('frame_designer_no_frames');
  const frame = frameModel(context, frames[0]!, definitions);
  return { lab: createUiLabSnapshot(), definitions, frames, frame,
    json: new CanvasTextEditor({ maxLength: 32_000, multiline: true }), specimenIndex: 0, scale: 2,
    paneId: frame.snapshot().definition.panes[0]?.id ?? null, mutationSequence: 0 };
}

export function buildUiLabCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const state = context.controller.toolState('ui-lab-canvas', () => createState(context));
  const frame = state.frame.snapshot();
  if (state.json.snapshot().value.length === 0) state.json.setValue(JSON.stringify(frame.definition, null, 2));
  const selectedPane = frame.definition.panes.find(({ id }) => id === state.paneId) ?? frame.definition.panes[0];
  const parts = canvasParts();
  const controlsBody = context.controlsBounds ?? context.bounds;
  const workspaceBody = context.workspaceBounds ?? context.bounds;
  const shell = canvasSlots(controlsBody, [
    { id: 'header', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
    { id: 'toolbar', minSize: { width: 0, height: 128 }, main: { mode: 'fixed', size: 128 } },
    { id: 'content', minSize: { width: 0, height: 90 }, main: { mode: 'grow', min: 90 } },
  ], { gap: 6 });
  const header = canvasSlots(shell['header']!, [
    { id: 'title', minSize: { width: 80, height: 40 }, main: { mode: 'grow', min: 80 } },
    { id: 'previous-frame', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
    { id: 'next-frame', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
  ], { direction: 'row', gap: 4 });
  canvasLabel(parts, 'title', `UI LAB · FRAME ${frame.definition.title} · ${frame.access.toUpperCase()}`,
    header['title']!, { heading: true });
  const selectFrame = (offset: number): void => {
    const index = state.frames.findIndex(({ id }) => id === state.frame.snapshot().definition.id);
    const next = state.frames[(index + offset + state.frames.length) % state.frames.length]!;
    state.frame = frameModel(context, next, state.definitions); state.paneId = next.panes[0]?.id ?? null;
    state.json.setValue(JSON.stringify(next, null, 2)); context.invalidate();
  };
  canvasAction(parts, 'previous-frame', 'Previous authored frame', header['previous-frame']!, () => selectFrame(-1), { glyph: '←' });
  canvasAction(parts, 'next-frame', 'Next authored frame', header['next-frame']!, () => selectFrame(1), { glyph: '→' });
  const toolbar = canvasSlots(shell['toolbar']!, [
    { id: 'previous-specimen', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
    { id: 'next-specimen', minSize: { width: 44, height: 40 }, main: { mode: 'fixed', size: 44 } },
    { id: 'scale', minSize: { width: 64, height: 40 }, main: { mode: 'grow', min: 64 } },
    { id: 'json', minSize: { width: 52, height: 40 }, main: { mode: 'fit', preferred: 82, min: 52 } },
    { id: 'apply', minSize: { width: 52, height: 40 }, main: { mode: 'fit', preferred: 82, min: 52 } },
    { id: 'publish', minSize: { width: 64, height: 40 }, main: { mode: 'fit', preferred: 100, min: 64 } },
  ], { direction: 'row', gap: 4, wrap: true });
  const specimen = state.lab.specimens[state.specimenIndex % state.lab.specimens.length]!;
  canvasAction(parts, 'previous-specimen', 'Previous UI specimen', toolbar['previous-specimen']!, () => {
    state.specimenIndex = (state.specimenIndex - 1 + state.lab.specimens.length) % state.lab.specimens.length; context.invalidate();
  }, { glyph: '‹' });
  canvasAction(parts, 'next-specimen', 'Next UI specimen', toolbar['next-specimen']!, () => {
    state.specimenIndex = (state.specimenIndex + 1) % state.lab.specimens.length; context.invalidate();
  }, { glyph: '›' });
  canvasAction(parts, 'scale', 'Cycle UI preview scale', toolbar['scale']!, () => {
    const scales = state.lab.scales; const index = scales.indexOf(state.scale);
    state.scale = scales[(index + 1) % scales.length] ?? scales[0]!; context.invalidate();
  }, { glyph: `SCALE ${state.scale}×` });
  const readOnly = frame.access === 'read_only';
  canvasAction(parts, 'json', 'Edit frame definition JSON', toolbar['json']!, () => state.json.focus(),
    { role: 'textbox', glyph: '{ }', disabled: readOnly });
  canvasAction(parts, 'apply', 'Apply frame definition JSON', toolbar['apply']!, () => {
    try { state.frame.replaceDefinition(state.json.snapshot().value); context.invalidate(); }
    catch (error) { reportCanvasError(context, 'Frame definition rejected', error); }
  }, { glyph: 'APPLY', disabled: readOnly });
  canvasAction(parts, 'publish', 'Publish authored frame', toolbar['publish']!, () => {
    state.mutationSequence += 1;
    void state.frame.publish(`frame.canvas.${state.mutationSequence}`, 'Canvas frame design')
      .then(() => context.controller.notifications.push('success', 'Frame published', frame.definition.id))
      .catch((error: unknown) => reportCanvasError(context, 'Frame publish failed', error)).finally(context.invalidate);
  }, { glyph: 'PUBLISH', disabled: !frame.canPublish, tone: 'success' });

  const content = canvasSlots(shell['content']!, [
    { id: 'catalog', minSize: { width: 0, height: 150 }, main: { mode: 'fit', preferred: 220, min: 150 } },
    { id: 'inspector', minSize: { width: 0, height: 120 }, main: { mode: 'grow', min: 120 } },
  ], { gap: 6 });
  const catalog = canvasPanel(parts, 'catalog-panel', content['catalog']!, 'thin', 3);
  const preview = workspaceBody;
  const inspector = canvasPanel(parts, 'inspector-panel', content['inspector']!, 'thin', 3);
  const catalogSlots = canvasSlots(catalog, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'specimen', minSize: { width: 0, height: 74 }, main: { mode: 'fixed', size: 74 } },
    { id: 'panes', minSize: { width: 0, height: 40 }, main: { mode: 'grow', min: 36 } },
  ], { gap: 4 });
  canvasLabel(parts, 'catalog-title', `SPECIMEN ${state.specimenIndex + 1}/${state.lab.specimens.length}`,
    catalogSlots['title']!, { heading: true });
  canvasLabel(parts, 'specimen', `${specimen.contractId}\n${specimen.dock.title} · ${specimen.dock.frame}\n${specimen.dock.metrics.minimumWidth}×${specimen.dock.metrics.minimumHeight}`,
    catalogSlots['specimen']!, { field: true });
  const paneRows = canvasRows(catalogSlots['panes']!, frame.definition.panes.length, 40, 4);
  frame.definition.panes.slice(0, paneRows.length).forEach((pane, index) => canvasAction(parts, `pane-${pane.id}`,
    `Inspect frame pane ${pane.label ?? pane.id}`, paneRows[index]!, () => { state.paneId = pane.id; context.invalidate(); },
    { role: 'option', glyph: `${index + 1}. ${pane.label ?? pane.id} · ${pane.kind}`, active: selectedPane?.id === pane.id }));

  const previewSlots = canvasSlots(preview, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'frame', minSize: { width: 0, height: 80 }, main: { mode: 'grow', min: 80 } },
    { id: 'status', minSize: { width: 0, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 4 });
  canvasLabel(parts, 'preview-title', 'AUTHORED FRAME PREVIEW', previewSlots['title']!, { heading: true });
  const framePreview = canvasPanel(parts, 'authored-frame', previewSlots['frame']!, 'wood', 4);
  const buttons = frame.definition.buttons ?? [];
  const previewRows = canvasRows(framePreview, frame.definition.panes.length + buttons.length, 40, 4);
  const previewItems = [
    ...frame.layout.panes.map(({ definition, layout }) => `${definition.label ?? definition.id} · ${layout.region.width}×${layout.region.height}`),
    ...buttons.map(({ label, interaction }) => `${label} · ${interaction}`),
  ];
  previewItems.slice(0, previewRows.length).forEach((label, index) => canvasLabel(parts, `preview-item-${index}`, label,
    previewRows[index]!, { field: true, tone: index >= frame.layout.panes.length ? 'success' : 'normal' }));
  canvasLabel(parts, 'preview-status', `${frame.hitTargets.length} HIT TARGETS · ${frame.validation.errors.length} ERRORS`,
    previewSlots['status']!, { field: true, tone: frame.validation.valid ? 'success' : 'danger' });

  const inspectorSlots = canvasSlots(inspector, [
    { id: 'title', minSize: { width: 0, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'summary', minSize: { width: 0, height: 72 }, main: { mode: 'grow', min: 72 } },
    { id: 'controls', minSize: { width: 0, height: 76 }, main: { mode: 'fixed', size: 76 } },
  ], { gap: 5 });
  canvasLabel(parts, 'inspector-title', 'FRAME DESIGNER', inspectorSlots['title']!, { heading: true });
  canvasLabel(parts, 'pane-summary', selectedPane === undefined ? 'NO PANE'
    : `${selectedPane.label ?? selectedPane.id}\n${selectedPane.kind} · ${selectedPane.columns ?? 1}×${selectedPane.rows ?? 1}`,
  inspectorSlots['summary']!, { field: true });
  const controls = canvasSlots(inspectorSlots['controls']!, [
    { id: 'up', minSize: { width: 44, height: 40 }, main: { mode: 'grow', min: 44 } },
    { id: 'down', minSize: { width: 44, height: 40 }, main: { mode: 'grow', min: 44 } },
    { id: 'columns-down', minSize: { width: 44, height: 40 }, main: { mode: 'grow', min: 44 } },
    { id: 'columns-up', minSize: { width: 44, height: 40 }, main: { mode: 'grow', min: 44 } },
  ], { direction: 'row', gap: 4, wrap: true });
  const paneIndex = selectedPane === undefined ? -1 : frame.definition.panes.findIndex(({ id }) => id === selectedPane.id);
  canvasAction(parts, 'pane-up', 'Move selected pane earlier', controls['up']!, () => {
    if (selectedPane !== undefined && paneIndex > 0) state.frame.movePane(selectedPane.id, paneIndex - 1); context.invalidate();
  }, { glyph: '↑', disabled: readOnly || paneIndex <= 0 });
  canvasAction(parts, 'pane-down', 'Move selected pane later', controls['down']!, () => {
    if (selectedPane !== undefined && paneIndex >= 0 && paneIndex < frame.definition.panes.length - 1) state.frame.movePane(selectedPane.id, paneIndex + 1);
    context.invalidate();
  }, { glyph: '↓', disabled: readOnly || paneIndex < 0 || paneIndex >= frame.definition.panes.length - 1 });
  canvasAction(parts, 'columns-down', 'Reduce selected pane columns', controls['columns-down']!, () => {
    if (selectedPane !== undefined) state.frame.updatePaneGrid(selectedPane.id, Math.max(1, (selectedPane.columns ?? 1) - 1), selectedPane.rows ?? 1);
    context.invalidate();
  }, { glyph: '− COL', disabled: readOnly || selectedPane === undefined });
  canvasAction(parts, 'columns-up', 'Increase selected pane columns', controls['columns-up']!, () => {
    if (selectedPane !== undefined) state.frame.updatePaneGrid(selectedPane.id, (selectedPane.columns ?? 1) + 1, selectedPane.rows ?? 1);
    context.invalidate();
  }, { glyph: '+ COL', disabled: readOnly || selectedPane === undefined });
  parts.textEditors.push({ id: 'json', editor: state.json });
  context.controller.validation.setIssues([
    ...frame.validation.errors.map((issue, index) => ({ id: `frame:error:${index}`, severity: 'error' as const, message: issue.message })),
    ...frame.validation.warnings.map((issue, index) => ({ id: `frame:warning:${index}`, severity: 'warning' as const, message: issue.message })),
  ]);
  return finishCanvasTool(context, parts, (drawing) => {
    const target = previewSlots['frame']!;
    const source = frame.layout.storage.frame;
    const scale = Math.max(0.1, Math.min(target.width / Math.max(1, source.width), target.height / Math.max(1, source.height)));
    const offsetX = target.x + (target.width - source.width * scale) / 2;
    const offsetY = target.y + (target.height - source.height * scale) / 2;
    const project = (rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }) => ({
      x: offsetX + (rect.x - source.x) * scale, y: offsetY + (rect.y - source.y) * scale,
      width: rect.width * scale, height: rect.height * scale,
    });
    drawing.save();
    const outer = project(source); drawing.fillStyle = '#d6bd83'; drawing.fillRect(outer.x, outer.y, outer.width, outer.height);
    frame.layout.panes.forEach((pane, index) => {
      const rect = project(pane.layout.region);
      drawing.fillStyle = ['#8da36d', '#9b765c', '#6e8b92', '#8c7296'][index % 4]!;
      drawing.fillRect(rect.x, rect.y, rect.width, rect.height);
      drawing.strokeStyle = selectedPane?.id === pane.definition.id ? '#fff2a8' : '#4f3928';
      drawing.lineWidth = selectedPane?.id === pane.definition.id ? 3 : 1; drawing.strokeRect(rect.x, rect.y, rect.width, rect.height);
    });
    frame.layout.buttons.forEach(({ rect }) => {
      const button = project(rect); drawing.fillStyle = '#6f9d55'; drawing.fillRect(button.x, button.y, button.width, button.height);
    });
    drawing.restore();
  });
}
