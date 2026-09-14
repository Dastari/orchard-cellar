import {
  type FantasyButtonGlyph,
  layoutUiFlex,
  layoutUiFrameSlots,
  type StudioCanvasShellNode,
  type UiFlexDirection,
  type UiFlexItem,
  type UiFrameStyle,
  type UiRect,
} from '@orchard/ui';
import type {
  StudioCanvasToolAction,
  StudioCanvasToolContext,
  StudioCanvasToolKeyInput,
  StudioCanvasToolSurface,
  StudioCanvasToolTextEditor,
} from '../shell/canvas-tool.js';

export interface BuildCanvasParts {
  readonly nodes: StudioCanvasShellNode[];
  readonly actions: StudioCanvasToolAction[];
  readonly textEditors: StudioCanvasToolTextEditor[];
}

export function canvasParts(): BuildCanvasParts {
  return { nodes: [], actions: [], textEditors: [] };
}

export function canvasPanel(
  parts: BuildCanvasParts,
  id: string,
  bounds: UiRect,
  style: Extract<UiFrameStyle, 'wood' | 'parchment' | 'thin'> = 'thin',
  padding = 2,
): UiRect {
  parts.nodes.push({ id, kind: style === 'wood' ? 'wood_panel' : style === 'parchment' ? 'parchment_panel' : 'thin_panel', bounds });
  return layoutUiFrameSlots(bounds, style, [{ id: 'content', minSize: { width: 0, height: 0 }, grow: 1 }], {
    padding,
  }).slots['content']!;
}

export function canvasSlots(
  bounds: UiRect,
  slots: readonly ({ readonly id: string } & UiFlexItem)[],
  options: { readonly direction?: UiFlexDirection; readonly gap?: number; readonly wrap?: boolean } = {},
): Readonly<Record<string, UiRect>> {
  const rects = layoutUiFlex(bounds, slots, {
    direction: options.direction ?? 'column', gap: options.gap ?? 4, wrap: options.wrap ?? false,
  });
  return Object.freeze(Object.fromEntries(slots.map((slot, index) => [slot.id, rects[index]!])));
}

export function canvasLabel(
  parts: BuildCanvasParts,
  id: string,
  label: string,
  bounds: UiRect,
  options: Pick<StudioCanvasShellNode, 'tone' | 'state'> & { readonly heading?: boolean; readonly field?: boolean } = {},
): void {
  parts.nodes.push({ id, kind: options.heading ? 'heading' : options.field ? 'field' : 'label',
    bounds, label, tone: options.tone, state: options.state });
}

export function canvasAction(
  parts: BuildCanvasParts,
  id: string,
  label: string,
  bounds: UiRect,
  activate: StudioCanvasToolAction['activate'],
  options: {
    readonly role?: StudioCanvasToolAction['role'];
    readonly disabled?: boolean;
    readonly active?: boolean;
    /** Compact visible glyph; `label` remains the keyboard/focus tooltip text. */
    readonly glyph?: string;
    /** Authored button-atlas glyph used by UI Lab. */
    readonly buttonGlyph?: FantasyButtonGlyph;
    /** Authored fantasy icon-catalog cell used by UI Lab. */
    readonly icon?: StudioCanvasShellNode['icon'];
    /** Shared editor symbol rasterized by the Canvas shell. */
    readonly symbol?: StudioCanvasShellNode['symbol'];
    /** Generated atlas crop rendered inside the UI-LAB inventory slot. */
    readonly preview?: StudioCanvasShellNode['preview'];
    /** Use the authored inventory-slot chrome even while a preview is loading. */
    readonly slot?: boolean;
    readonly tone?: StudioCanvasShellNode['tone'];
    /** Returns a local action id which `finishCanvasTool` namespaces. */
    readonly keyDown?: (input: StudioCanvasToolKeyInput) => string | null;
  } = {},
): void {
  if (bounds.width < 40 || bounds.height < 40) {
    throw new Error(`studio_canvas_hit_target_too_small:${id}:${bounds.width}x${bounds.height}`);
  }
  const disabled = options.disabled === true;
  const role = options.role ?? 'button';
  const iconOnly = options.buttonGlyph !== undefined || options.icon !== undefined
    || options.symbol !== undefined || options.preview !== undefined;
  if (iconOnly && options.slot !== true && options.preview === undefined) {
    const size = Math.min(bounds.width, bounds.height);
    bounds = { x: bounds.x + (bounds.width - size) / 2, y: bounds.y + (bounds.height - size) / 2, width: size, height: size };
  }
  parts.nodes.push({ id, kind: options.slot === true || options.preview !== undefined ? 'slot'
    : role === 'textbox' ? 'field' : role === 'tab' ? 'tab' : 'button', bounds,
    label: iconOnly ? undefined : options.glyph ?? label, glyph: options.buttonGlyph, icon: options.icon,
    symbol: options.symbol, preview: options.preview, tone: options.tone,
    state: disabled ? 'disabled' : options.active ? 'active' : 'idle' });
  parts.actions.push({ id, label, role, bounds, disabled, activate,
    ...(options.keyDown === undefined ? {} : { keyDown: options.keyDown }) });
}

export function canvasRows(bounds: UiRect, count: number, rowHeight = 40, gap = 4): readonly UiRect[] {
  const visible = Math.max(0, Math.min(count, Math.floor((bounds.height + gap) / (rowHeight + gap))));
  return layoutUiFlex(bounds, Array.from({ length: visible }, () => ({
    minSize: { width: 0, height: rowHeight }, main: { mode: 'fixed', size: rowHeight },
  })), { direction: 'column', gap });
}

export function reportCanvasError(context: StudioCanvasToolContext, title: string, error: unknown): void {
  context.controller.notifications.push('error', title, error instanceof Error ? error.message : String(error));
  context.invalidate();
}

export function finishCanvasTool(
  context: StudioCanvasToolContext,
  parts: BuildCanvasParts,
  draw?: StudioCanvasToolSurface['draw'],
  input?: StudioCanvasToolSurface['input'],
): StudioCanvasToolSurface {
  const prefix = `${context.route.tool.id}-`;
  if (parts.nodes.length > 200 || parts.actions.length > 200) throw new Error('studio_canvas_tool_budget_exceeded');
  return Object.freeze({
    nodes: Object.freeze(parts.nodes.map((node) => Object.freeze({ ...node, id: `${prefix}${node.id}` }))),
    actions: Object.freeze(parts.actions.map((action) => Object.freeze({
      ...action,
      id: `${prefix}${action.id}`,
      ...(action.keyDown === undefined ? {} : {
        keyDown: (input: StudioCanvasToolKeyInput): string | null => {
          const focusId = action.keyDown!(input);
          return focusId === null ? null : `${prefix}${focusId}`;
        },
      }),
    }))),
    textEditors: Object.freeze(parts.textEditors.map((entry) => Object.freeze({ ...entry, id: `${prefix}${entry.id}` }))),
    draw,
    input,
  });
}
