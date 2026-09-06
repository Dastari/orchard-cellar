import type {
  CanvasFocusRole,
  CanvasTextEditor,
  StudioCanvasShellArt,
  StudioCanvasShellNode,
  StudioCanvasTableLayout,
  StudioCanvasTableHit,
  StudioCanvasTableScrollCommand,
  UiPoint,
  UiRect,
} from '@orchard/ui';
import type { StudioShellController } from './controller.js';
import type { StudioToolRoute } from './tool-registry.js';

export interface StudioCanvasToolAction {
  readonly id: string;
  readonly label: string;
  readonly role: CanvasFocusRole;
  readonly bounds: UiRect;
  readonly disabled?: boolean;
  /** Keyboard activation omits this payload; pointer activation preserves the
   * release-event modifiers for desktop-style range/additive controls. */
  readonly activate: (input?: StudioCanvasToolActionActivation) => void;
  /** Optional retained keyboard behavior for composite controls such as a
   * tree. Return the next action id to consume the key and move real Canvas
   * focus, or null to defer to the shell's ordinary roving-focus behavior. */
  readonly keyDown?: (input: StudioCanvasToolKeyInput) => string | null;
}

export interface StudioCanvasToolActionActivation {
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

export interface StudioCanvasToolTextEditor {
  readonly id: string;
  readonly editor: CanvasTextEditor;
}

export interface StudioCanvasToolTable {
  readonly id: string;
  readonly layout: StudioCanvasTableLayout;
  readonly onHit?: (hit: StudioCanvasTableHit) => void;
  readonly onScroll?: (command: StudioCanvasTableScrollCommand, nextScrollRow: number) => void;
}

export interface StudioCanvasToolPointerInput {
  readonly point: UiPoint;
  readonly button: number;
  readonly pointerId: number;
  /** True while the canvas owns an unmodified Space key hold. Spatial tools
   * use this for Photoshop-style primary-button panning. */
  readonly spaceHeld?: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

export interface StudioCanvasToolWheelInput {
  readonly point: UiPoint;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

export interface StudioCanvasToolKeyInput {
  readonly key: string;
  readonly repeat: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/** Optional retained interaction hooks for spatial tools. A tool surface is
 * rebuilt whenever Studio redraws, but these closures own state through
 * `controller.toolState`, so input never depends on a stale display graph. */
export interface StudioCanvasToolInput {
  /** Requests shell-level Space tracking without stealing Space from buttons
   * or text editors on tools which do not implement drag panning. */
  readonly spaceDragPan?: boolean;
  readonly pointerDown?: (input: StudioCanvasToolPointerInput) => boolean;
  readonly pointerMove?: (input: StudioCanvasToolPointerInput) => boolean;
  readonly pointerUp?: (input: StudioCanvasToolPointerInput) => boolean;
  readonly pointerCancel?: (input: StudioCanvasToolPointerInput) => boolean;
  readonly wheel?: (input: StudioCanvasToolWheelInput) => boolean;
  readonly keyDown?: (input: StudioCanvasToolKeyInput) => boolean;
}

export interface StudioCanvasToolLifecycle {
  /** Stable across redraws while this logical tool surface remains mounted. */
  readonly key: string;
  readonly dispose: () => void;
}

export interface StudioCanvasToolSurface {
  readonly nodes: readonly StudioCanvasShellNode[];
  readonly actions: readonly StudioCanvasToolAction[];
  readonly textEditors?: readonly StudioCanvasToolTextEditor[];
  readonly tables?: readonly StudioCanvasToolTable[];
  readonly input?: StudioCanvasToolInput;
  /** Resource teardown for retained models/workers. The shell disposes a
   * lifecycle when its keyed surface leaves the primary/secondary scene. */
  readonly lifecycle?: StudioCanvasToolLifecycle;
  /** Spatial/graph/preview content only. Chrome remains in nodes/tables. */
  readonly draw?: (context: CanvasRenderingContext2D, art: StudioCanvasShellArt) => void;
}

export interface StudioCanvasToolContext {
  /** Active tool controls live in the left drawer. */
  readonly controlsBounds: UiRect;
  /** Main editor/canvas/table surface lives in the center. */
  readonly workspaceBounds: UiRect;
  /** Safe content area of the floating right drawer. Map owns this region for
   * its selection inspector and layer stack; older tools may ignore it. */
  readonly inspectorBounds?: UiRect;
  /** Compatibility alias for workspaceBounds during the canvas migration. */
  readonly bounds: UiRect;
  readonly route: StudioToolRoute;
  readonly controller: StudioShellController;
  readonly invalidate: () => void;
}

export type StudioCanvasToolBuilder = (context: StudioCanvasToolContext) => StudioCanvasToolSurface;

export const EMPTY_STUDIO_CANVAS_TOOL_SURFACE: StudioCanvasToolSurface = Object.freeze({
  nodes: Object.freeze([]),
  actions: Object.freeze([]),
  textEditors: Object.freeze([]),
  tables: Object.freeze([]),
});
