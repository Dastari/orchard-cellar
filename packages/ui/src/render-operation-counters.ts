/** Semantic counters are always available; native Canvas probes are opt-in.
 * Values start at the first rAF after the preceding presentation and end at
 * the current submission, including skipped-rAF preparation under a cap.
 * Async work before that first rAF remains outside the P0 frame scope. */
export const RENDER_COUNTER_IDS = [
  'drawImageCalls', 'distinctDrawImageSources', 'tintBuilds', 'tintReuses',
  'tintSurfaceReuses', 'filteredFrameBuilds', 'coverageFieldRebuilds',
  'preparedHeightRebuilds', 'groundSourceOperations', 'imageDataAllocations',
  'receiverSamples', 'receiverCandidates', 'receiverFullLoopCandidates',
  'saveCalls', 'restoreCalls', 'saveRestorePairs', 'surfaceAllocations',
] as const;
export type RenderCounterId = (typeof RENDER_COUNTER_IDS)[number];
export type RenderCounterValues = Record<RenderCounterId, number>;
export const renderOperationCounters: RenderCounterValues = {
  drawImageCalls: 0, distinctDrawImageSources: 0, tintBuilds: 0, tintReuses: 0,
  tintSurfaceReuses: 0, filteredFrameBuilds: 0, coverageFieldRebuilds: 0,
  preparedHeightRebuilds: 0, groundSourceOperations: 0, imageDataAllocations: 0,
  receiverSamples: 0, receiverCandidates: 0, receiverFullLoopCandidates: 0,
  saveCalls: 0, restoreCalls: 0, saveRestorePairs: 0, surfaceAllocations: 0,
};
export const renderCounterSupport = { nativeCanvas: false };
let generation = 0;
const sourceFrames = new WeakMap<object, number>();
const saves = new WeakMap<object, { generation: number; depth: number }>();
export function resetRenderOperationCounters(): void {
  generation++;
  for (const id of RENDER_COUNTER_IDS) renderOperationCounters[id] = 0;
}
export function countDrawImageSource(source: object): void {
  renderOperationCounters.drawImageCalls++;
  if (sourceFrames.get(source) === generation) return;
  sourceFrames.set(source, generation);
  renderOperationCounters.distinctDrawImageSources++;
}
export function countCanvasSave(context: object): void {
  renderOperationCounters.saveCalls++;
  let state = saves.get(context);
  if (state === undefined) { state = { generation, depth: 0 }; saves.set(context, state); }
  if (state.generation !== generation) { state.generation = generation; state.depth = 0; }
  state.depth++;
}
export function countCanvasRestore(context: object): void {
  renderOperationCounters.restoreCalls++;
  const state = saves.get(context);
  if (state?.generation !== generation || state.depth === 0) return;
  state.depth--; renderOperationCounters.saveRestorePairs++;
}
