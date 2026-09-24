import type { UiPoint } from '../geometry.js';
import { uiActionNotice } from '../kit/components/action-notice.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiFrame } from '../kit/components/frame.js';
import { uiMeter } from '../kit/components/meter.js';
import { uiNameplates, type UiNameplateLabel } from '../kit/components/nameplates.js';
import { uiText } from '../kit/components/text.js';
import { uiWorldFeedback, type UiWorldFeedbackEntry } from '../kit/components/world-feedback.js';
import { uiWorldHint, type UiWorldHint } from '../kit/components/world-hint.js';
import { uiWorldSpeech, type UiWorldSpeechMessage } from '../kit/components/world-speech.js';
import { uiFixed } from '../kit/layout/box.js';
import { measureUiElement } from '../kit/layout/measure.js';
import { UiElement } from '../kit/runtime/element.js';
import { UiRoot } from '../kit/runtime/root.js';
import type { UiTone } from '../kit/tokens.js';

export interface GameFeedbackLabel {
  /** Plain text only. Equipment details may contain newlines. */
  readonly text: string;
  /** Bottom-center in the safe-area logical viewport. */
  readonly anchor: UiPoint;
  readonly tone?: UiTone;
  /** Optional projected clearance above equipment slots. */
  readonly maxHeight?: number;
}
export interface GameSkillNotice {
  readonly id: string; readonly track: string; readonly points: number;
  /** Top edge in the safe-area viewport; host clamps the composed frame. */
  readonly y: number;
}
export interface GameFeedbackModel {
  /** Player identity, connection generation/status and current space/run. */
  readonly sessionKey: string;
  readonly world: {
    /** Coordinates are already projected into the full-canvas logical viewport. */
    readonly nameplates: readonly UiNameplateLabel[];
    readonly feedback: readonly UiWorldFeedbackEntry[];
    /** Caller filters public/private visibility and authoritative expiry. */
    readonly speech: readonly UiWorldSpeechMessage[];
    /** Caller supplies permission-filtered timing labels and frozen progress. */
    readonly hint: UiWorldHint | null;
    readonly fishing: ({ readonly id: string; readonly progress: number } & UiPoint) | null;
  };
  readonly hud: {
    readonly prompt: GameFeedbackLabel | null;
    readonly toast: GameFeedbackLabel | null;
    /** Caller owns dwell, equipment details and touch-safe placement. */
    readonly tooltip: GameFeedbackLabel | null;
    readonly notice: GameSkillNotice | null;
  };
  readonly reducedMotion?: boolean;
}
export interface GameFeedbackBounds {
  readonly worldWidth: number; readonly worldHeight: number;
  readonly hudWidth: number; readonly hudHeight: number;
}
export interface GameSkillNoticeScope {
  readonly sessionKey: string; readonly noticeId: string; readonly track: string; readonly points: number;
}
export interface GameFeedbackCallbacks {
  /** Recheck the expected notice; open also performs the existing dismissal. */
  readonly onOpenSkillNotice: (expected: GameSkillNoticeScope) => void;
  readonly onDismissSkillNotice: (expected: GameSkillNoticeScope) => void;
}

/** Three unbound roots sharing the coordinator's projection, clock and lifecycle.
 * World/HUD are paint-only. Register only notice with the input runtime. */
export class GameFeedback {
  readonly roots: Readonly<Record<'world' | 'hud' | 'notice', UiRoot>>;
  private model: GameFeedbackModel | null = null;
  private readonly names = uiNameplates();
  private readonly quests = uiWorldFeedback();
  private readonly damage = uiWorldFeedback();
  private readonly speech = uiWorldSpeech();
  private readonly hint = uiWorldHint();
  private readonly fishing = uiMeter({ id: 'game.feedback.fishing', label: 'Fishing cast', value: 0, variant: 'resource', tone: 'success',
    layout: { position: 'absolute', width: uiFixed(24), height: uiFixed(4), visible: false } });
  private readonly labels: Record<'prompt' | 'toast' | 'tooltip', ReturnType<typeof feedbackLabel>>;
  private notice: UiElement | null = null;
  private noticeKey = '';
  private noticeUsed = false;
  private noticeFits = true;
  constructor(art: UiKitArt, private readonly callbacks: GameFeedbackCallbacks) {
    this.roots = {
      world: new UiRoot({ art, scale: 1, label: 'World feedback' }),
      hud: new UiRoot({ art, scale: 1, label: 'Contextual feedback' }),
      notice: new UiRoot({ art, scale: 1, label: 'Skill point notice' }),
    };
    this.roots.world.mount(new UiElement({ kind: 'feedback-world', style: { display: 'stack', width: 'grow', height: 'grow' },
      children: [this.names, this.fishing, this.quests, this.hint, this.damage, this.speech] }));
    this.labels = { prompt: feedbackLabel('prompt'), toast: feedbackLabel('toast'), tooltip: feedbackLabel('tooltip') };
    for (const label of Object.values(this.labels)) this.roots.hud.mount(label);
  }
  get noticeVisible(): boolean { return this.notice !== null && this.noticeFits; }
  get noticeActive(): boolean { return this.noticeVisible && !this.noticeUsed; }
  setBounds(bounds: GameFeedbackBounds, dpr = 1): void {
    this.roots.world.resize(bounds.worldWidth, bounds.worldHeight, dpr);
    this.roots.hud.resize(bounds.hudWidth, bounds.hudHeight, dpr);
    this.roots.notice.resize(bounds.hudWidth, bounds.hudHeight, dpr);
    this.arrange();
  }
  update(model: GameFeedbackModel): void {
    this.model = model;
    for (const root of Object.values(this.roots)) root.reducedMotion = model.reducedMotion ?? false;
    this.names.setProps({ labels: model.world.nameplates });
    this.quests.setProps({ entries: model.world.feedback.filter(entry => entry.kind === 'quest') });
    this.damage.setProps({ entries: model.world.feedback.filter(entry => entry.kind === 'damage') });
    this.speech.setProps({ messages: model.world.speech });
    this.hint.setProps({ hint: model.world.hint });
    const fishing = model.world.fishing;
    this.fishing.setStyle({ visible: fishing !== null && Number.isFinite(fishing.x + fishing.y + fishing.progress),
      inset: fishing ? { left: uiFixed(fishing.x - 12), top: uiFixed(fishing.y) } : undefined });
    this.fishing.setProps({ value: fishing?.progress ?? 0 }, false);
    for (const kind of ['prompt', 'toast', 'tooltip'] as const) this.labels[kind].update(model.hud[kind]);
    const notice = model.hud.notice;
    const key = JSON.stringify([model.sessionKey, notice?.id, notice?.track, notice?.points]);
    if (key !== this.noticeKey) {
      this.noticeKey = key; this.noticeUsed = false; this.noticeFits = true;
      this.roots.notice.input.cancelPointers(); this.roots.notice.focus.set(null);
      this.notice?.dispose(); this.notice = null;
      if (notice) {
        const scope: GameSkillNoticeScope = { sessionKey: model.sessionKey, noticeId: notice.id, track: notice.track, points: notice.points };
        const message = notice.points === 1 ? `NEW ${notice.track.toUpperCase()} SKILL POINT · OPEN`
          : `${notice.points} NEW ${notice.track.toUpperCase()} SKILL POINTS · OPEN`;
        let dense = false, normalHeight = 0;
        const makePanel = () => uiActionNotice({ id: 'game.feedback.notice', message, tone: 'success', activateOn: 'up', compact: true, dense,
          onOpen: () => this.activate(key, scope, true), onDismiss: () => this.activate(key, scope, false),
          layout: { position: 'absolute', width: 'grow', height: 'fit' } });
        let panel = makePanel();
        this.notice = this.roots.notice.mount(new UiElement({ id: 'game.feedback.notice-host',
          style: { display: 'stack', width: 'grow', height: 'grow' }, props: { singlePointer: true }, children: [panel],
          onKeyCapture: event => !!event.repeat && ['Enter', ' ', 'ContextMenu'].includes(event.key),
          measure: (element, available) => {
            const width = Math.max(0, Math.min(390, available.width - 12));
            panel.setStyle({ visible: true, width: uiFixed(width), height: 'fit' });
            if (!dense) normalHeight = measureUiElement(panel, { width, height: Math.max(100, available.height) }).preferred.height;
            // HUD is arranged first. Rejection text has priority over the optional notice.
            const toast = this.model?.hud.toast ? this.labels.toast.bounds() : null;
            const budget = Math.max(0, Math.min(available.height, toast ? toast.y - 4 : available.height));
            const nextDense = budget < normalHeight;
            if (nextDense !== dense) {
              const focusId = this.roots.notice.focus.current?.id;
              this.roots.notice.input.cancelPointers(); panel.dispose();
              dense = nextDense; panel = makePanel(); element.append(panel);
              if (focusId) this.roots.notice.entries().find(row => row.element.id === focusId)?.element.requestFocus();
            }
            const fits = budget >= 16;
            if (this.noticeFits && !fits) { this.roots.notice.input.cancelPointers(); this.roots.notice.focus.set(null); }
            this.noticeFits = fits;
            const open = this.roots.notice.entries().find(({ element }) => element.id === 'game.feedback.notice:open')?.element;
            open?.setProps({ label: dense || width < 120 ? 'OPEN' : width < 200 ? `SKILLS +${notice.points}` : message });
            panel.setStyle({ visible: fits, width: uiFixed(width), height: 'fit' });
            const height = Math.min(budget, measureUiElement(panel, { width, height: available.height }).preferred.height);
            const y = this.model?.hud.notice?.y ?? 0;
            panel.setStyle({ height: uiFixed(height), inset: { left: uiFixed((available.width - width) / 2),
              top: uiFixed(Math.max(0, Math.min(available.height - height, toast ? toast.y - height - 4 : Infinity, Number.isFinite(y) ? y : 0))) } });
            return { min: { width: 0, height: 0 }, preferred: available };
          },
        }));
      }
    }
    // Notice placement depends on the HUD's newly arranged toast, not only its own scope.
    this.notice?.invalidate();
    this.arrange();
  }
  private activate(key: string, scope: GameSkillNoticeScope, open: boolean): void {
    if (key !== this.noticeKey || !this.noticeActive) return;
    this.noticeUsed = true; this.roots.notice.input.cancelPointers();
    // Authority owns dismissal; prevent duplicate submission while awaiting its snapshot.
    (open ? this.callbacks.onOpenSkillNotice : this.callbacks.onDismissSkillNotice)(scope);
  }
  private arrange(): void { for (const root of Object.values(this.roots)) root.arrange(); }
  dispose(): void { for (const root of Object.values(this.roots)) root.dispose(); this.model = null; this.notice = null; }
}

/** Shared frame/text composition; no legacy pixel painter or pointer handlers. */
function feedbackLabel(kind: string) {
  let model: GameFeedbackLabel | null = null;
  const textNode = () => uiText('', { id: `game.feedback.${kind}.text`, wrap: true, align: 'center', layout: { width: 'grow' } });
  let text = textNode(), tone: UiTone = 'primary';
  const makeFrame = () => uiFrame({ id: `game.feedback.${kind}.frame`, tone, padding: 4,
    children: [text], layout: { position: 'absolute', height: 'fit' } });
  let frame = makeFrame();
  const element = new UiElement({ id: `game.feedback.${kind}`, style: { display: 'stack', width: 'grow', height: 'grow' }, children: [frame],
    measure(_element, available) {
      const value = model;
      const visible = value !== null && value.text.length > 0 && Number.isFinite(value.anchor.x + value.anchor.y);
      frame.setStyle({ visible });
      if (visible) {
        text.setProps({ text: value.text });
        const maximum = Math.max(0, Math.min(kind === 'tooltip' ? 390 : 320, available.width - 12));
        text.setStyle({ width: 'fit' });
        const natural = measureUiElement(text, { width: Math.max(0, maximum - 8), height: available.height }).preferred;
        const width = Math.min(maximum, Math.max(104, natural.width + 8));
        text.setStyle({ width: 'grow' });
        frame.setStyle({ width: uiFixed(width), height: 'fit' });
        const maximumHeight = value.maxHeight !== undefined && Number.isFinite(value.maxHeight) ? Math.max(0, value.maxHeight) : available.height;
        const height = Math.min(available.height, maximumHeight, measureUiElement(frame, { width, height: available.height }).preferred.height);
        frame.setStyle({ height: uiFixed(height), inset: {
          left: uiFixed(Math.max(0, Math.min(available.width - width, value.anchor.x - width / 2))),
          top: uiFixed(Math.max(0, Math.min(available.height - height, value.anchor.y - height))),
        } });
      }
      return { min: { width: 0, height: 0 }, preferred: available };
    },
  });
  return Object.assign(element, { bounds: () => frame.visible ? frame.rect : null, update(next: GameFeedbackLabel | null) {
    const nextTone = next?.tone ?? 'primary';
    if (nextTone !== tone) { frame.dispose(); tone = nextTone; text = textNode(); frame = makeFrame(); element.append(frame); }
    model = next; element.invalidate();
  } });
}
