import type { UnifiedRenderer } from '@orchard/engine/renderer';
import {
  containsPoint, drawButton, drawPixelTextInRect, drawUiFrame, drawOrchardBackdrop,
  type PixelUi, type UiPoint, type UiRect, type UiSize, type UiSkin,
} from '@orchard/ui';

export type ConnectionRecoveryState = 'reconnecting' | 'offline' | 'sign-in-required' | 'content-incompatible';
export type ConnectionRecoveryAction = 'retry' | 'sign-in';

export interface ConnectionRecoveryViewport extends UiSize {
  readonly scale: number;
  /** CSS safe-area offsets; width/height and input points are UI-local units. */
  readonly left: number;
  readonly top: number;
}

export function connectionRecoveryLayout(viewport: UiSize): { readonly frame: UiRect; readonly button: UiRect } {
  const width = Math.max(0, Math.min(320, viewport.width - 16));
  const height = Math.max(0, Math.min(138, viewport.height - 16));
  const frame = {
    x: Math.floor((viewport.width - width) / 2), y: Math.floor((viewport.height - height) / 2), width, height,
  };
  const buttonWidth = Math.max(0, Math.min(120, width - 36));
  return { frame, button: {
    x: Math.floor(frame.x + (width - buttonWidth) / 2),
    y: frame.y + Math.max(0, height - 42), width: buttonWidth, height: Math.min(24, height),
  } };
}

const copy: Readonly<Record<ConnectionRecoveryState, { readonly title: string; readonly lines: readonly string[] }>> = {
  'content-incompatible': { title: 'CONTENT UPDATE REQUIRED', lines: ['GAME CONTENT IS INCOMPATIBLE.', 'PLEASE WAIT FOR AN UPDATE.'] },
  reconnecting: { title: 'RECONNECTING', lines: ['RESTORING CONNECTION.', 'RETRY IF NEEDED.'] },
  offline: { title: 'CONNECTION LOST', lines: ['CONNECTION INTERRUPTED.', 'CHECK YOUR CONNECTION.'] },
  'sign-in-required': { title: 'SIGN IN REQUIRED', lines: ['PLEASE SIGN IN AGAIN.', 'REJOIN YOUR WORLD.'] },
};

/** How long a returning world may sit not-ready (tab resume, subscription re-sync)
 * behind its last frame before the reconnecting modal appears. */
export const WORLD_GAP_GRACE_MS = 1500;

export type WorldGapPresentation =
  | { readonly kind: 'initial-loading' }
  | { readonly kind: 'retained-world' }
  | { readonly kind: 'recovery'; readonly state: ConnectionRecoveryState };

/**
 * What to show while the world isn't ready. The initial loading screen is for
 * the first load only: once a world frame exists, keep it on screen and only
 * raise the reconnecting modal if the gap outlasts the grace period (BUG-040).
 */
export function worldGapPresentation(
  state: ConnectionRecoveryState | null,
  hasWorldFrame: boolean,
  gapStartedAt: number,
  now: number,
  graceMs = WORLD_GAP_GRACE_MS,
): WorldGapPresentation {
  if (state !== null) return { kind: 'recovery', state };
  if (!hasWorldFrame) return { kind: 'initial-loading' };
  return now - gapStartedAt < graceMs ? { kind: 'retained-world' } : { kind: 'recovery', state: 'reconnecting' };
}

/** A canvas-only game modal. The host owns connection effects and keyboard focus. */
export class ConnectionRecoveryOverlay {
  constructor(private readonly fonts: PixelUi, private readonly skin: UiSkin) {}

  primaryAction(state: ConnectionRecoveryState | null, blockedByUpdate = false): ConnectionRecoveryAction | null {
    return blockedByUpdate || state === null ? null : state === 'sign-in-required' ? 'sign-in' : 'retry';
  }

  actionAt(point: UiPoint, viewport: UiSize, state: ConnectionRecoveryState | null, blockedByUpdate = false): ConnectionRecoveryAction | null {
    const action = this.primaryAction(state, blockedByUpdate);
    const button = connectionRecoveryLayout(viewport).button;
    return action !== null && button.width > 0 && button.height > 0 && containsPoint(button, point) ? action : null;
  }

  activate(point: UiPoint, viewport: UiSize, state: ConnectionRecoveryState | null,
    onAction: (action: ConnectionRecoveryAction) => void, blockedByUpdate = false): boolean {
    const action = this.actionAt(point, viewport, state, blockedByUpdate);
    if (action === null) return false;
    onAction(action);
    return true;
  }

  /** Draw in UI-local coordinates after restoring the retained world image. */
  draw(context: CanvasRenderingContext2D, viewport: UiSize, state: ConnectionRecoveryState): void {
    const { frame, button } = connectionRecoveryLayout(viewport);
    context.save();
    try {
      context.fillStyle = 'rgba(24, 17, 20, 0.76)';
      context.fillRect(0, 0, viewport.width, viewport.height);
      drawUiFrame(context, this.skin, frame, 'wood_parchment');
      const textWidth = Math.max(0, frame.width - 40);
      const line = (text: string, y: number, color = '#6b4428') => drawPixelTextInRect(context, this.fonts, text, {
        x: frame.x + 20, y, width: textWidth, height: 12,
      }, { align: 'center', color });
      line(copy[state].title, frame.y + 23, '#49301f');
      for (const [index, text] of copy[state].lines.entries()) line(text, frame.y + 46 + index * 14);
      drawButton(context, this.skin, this.fonts, button, {
        label: state === 'sign-in-required' ? 'SIGN IN' : 'RETRY',
      });
    } finally { context.restore(); }
  }

  /** No new loop or world draw: restore the retained buffer before every modal
   * pass, so stalled authority never causes cumulative backdrop darkening. */
  composite(
    renderer: Pick<UnifiedRenderer, 'compositeWorld' | 'beginUi' | 'endUi' | 'cssWidth' | 'cssHeight'>,
    viewport: ConnectionRecoveryViewport,
    state: ConnectionRecoveryState | null,
    hasWorldFrame: boolean,
    blockedByUpdate = false,
  ): boolean {
    if (this.primaryAction(state, blockedByUpdate) === null || state === null) return false;
    if (hasWorldFrame) renderer.compositeWorld();
    const context = renderer.beginUi(viewport.scale);
    try {
      if (!hasWorldFrame) {
        drawOrchardBackdrop(context, renderer.cssWidth / viewport.scale, renderer.cssHeight / viewport.scale);
      }
      context.translate(viewport.left / viewport.scale, viewport.top / viewport.scale);
      this.draw(context, viewport, state);
    } finally { renderer.endUi(); }
    return true;
  }
}
