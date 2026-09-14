import { authoredMapContentPainterTie, survivalDecorationBlocksTraversal, type MapDocumentV3 } from '@orchard/sim';
import { drawOverworldPoiDecoration, natureDecorationFrame, overworldPoiDecorationDepthY, pondShimmerFrameAtTick } from '@orchard/engine/overworld-art';
import { isLightEmitterKind } from '@orchard/engine/light-sources';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import type { RuntimeSurvivalDecoration } from './gameplay-painter-inputs.js';
import type { GameplayDecorationInputs } from './gameplay-painter-decorations.js';
import { GameplayDecorationIndex } from './gameplay-decoration-index.js';
import { drawLandmarkTransform } from './gameplay-painter-effects.js';

/** The three draw callbacks are born with the entity, and always read the
 * current frame's art/cohort, context, animation clock and receiver scope. */
class DecorationCommand implements WorldDepthItem {
  readonly x: number;
  readonly y: number;
  readonly footY: number;
  readonly tie: string;
  campfireLit = true;
  seen = 0;
  constructor(public input: GameplayDecorationInputs, readonly decoration: RuntimeSurvivalDecoration, document: MapDocumentV3 | null) {
    this.x = decoration.tileX * 16 + 8; this.y = (decoration.tileY + 1) * 16;
    this.footY = overworldPoiDecorationDepthY(decoration.kind, this.y);
    this.tie = decoration.landmark === undefined ? `decoration:${decoration.id}`
      : document === null ? `landmark:${decoration.landmark.id}`
        : authoredMapContentPainterTie(document, decoration.landmark.layer, 'landmark', decoration.landmark.id);
  }
  private readonly raw = (): void => {
    const { context, art, cameraX, cameraY, scale, visualTickClock, renderWeather, frameLightingModel } = this.input;
    const decoration = this.decoration;
    drawOverworldPoiDecoration(context, art, decoration.kind, this.x, this.y, cameraX, cameraY, scale,
      decoration.variant, natureDecorationFrame(decoration.kind, visualTickClock.renderTick, decoration.animationOffset, renderWeather.wind),
      this.campfireLit, frameLightingModel === 'unified' && decoration.kind === 'camp_pond'
        ? pondShimmerFrameAtTick(visualTickClock.renderTick) : null);
  };
  private readonly transformed = (): void => {
    const landmark = this.decoration.landmark;
    if (landmark === undefined) { this.raw(); return; }
    const { context, cameraX, cameraY, scale } = this.input;
    drawLandmarkTransform(context, landmark, Math.round((this.x - cameraX) * scale), Math.round((this.y - cameraY) * scale), this.raw);
  };
  readonly draw = (): void => {
    const { frameLightingModel, drawSouthFacingReceiver } = this.input, kind = this.decoration.kind;
    if (frameLightingModel !== 'unified' && survivalDecorationBlocksTraversal(kind, 'ground')
      && kind !== 'camp_pond' && !isLightEmitterKind(kind)) drawSouthFacingReceiver(this.x, this.y, this.transformed);
    else this.transformed();
  };
}

/** One bounded command cohort per world context; a source/map change retires
 * the entire previous cohort. Hidden/culling frames retire commands after two
 * frames. Retiring never mutates a command already queued for the current draw. */
class DecorationCommands {
  readonly index: GameplayDecorationIndex;
  readonly entries = new Map<RuntimeSurvivalDecoration, DecorationCommand>();
  private generation = 0;
  constructor(readonly source: readonly RuntimeSurvivalDecoration[], readonly document: MapDocumentV3 | null) {
    this.index = new GameplayDecorationIndex(source, document?.generatedSuppressions ?? []);
  }
  begin(): void { this.generation++; }
  get(input: GameplayDecorationInputs, decoration: RuntimeSurvivalDecoration, campfireLit: boolean): DecorationCommand {
    let command = this.entries.get(decoration);
    if (command === undefined) { command = new DecorationCommand(input, decoration, this.document); this.entries.set(decoration, command); }
    command.input = input; command.campfireLit = campfireLit; command.seen = this.generation;
    return command;
  }
  finish(): void {
    for (const [key, command] of this.entries) if (this.generation - command.seen > 2) this.entries.delete(key);
    for (const key of this.entries.keys()) {
      if (this.entries.size <= 4096) break;
      this.entries.delete(key);
    }
  }
}
const retained = new WeakMap<CanvasRenderingContext2D, DecorationCommands>();
export function beginDecorationCommands(context: CanvasRenderingContext2D, source: readonly RuntimeSurvivalDecoration[], document: MapDocumentV3 | null): DecorationCommands {
  let commands = retained.get(context);
  if (commands === undefined || commands.source !== source || commands.document !== document) {
    commands = new DecorationCommands(source, document); retained.set(context, commands);
  }
  commands.begin(); return commands;
}
export function releaseDecorationCommands(context: CanvasRenderingContext2D): void { retained.delete(context); }
