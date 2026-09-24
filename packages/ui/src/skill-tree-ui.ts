import type { EquipmentSkillResolution, ProgressionContentDefinition, SkillNodeDefinition, SkillTrack } from '@orchard/sim';
import type { LoadedAsset } from './assets.js';
import type { UiRect } from './geometry.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiSkills, type UiSkillsElement } from './kit/components/skills.js';
import { uiFixed } from './kit/layout/box.js';
import { UiRoot } from './kit/runtime/root.js';

export interface SkillTrackProgressModel {
  readonly track: SkillTrack;
  readonly experience: bigint;
  readonly spentPoints: number;
  readonly bonusPoints: number;
  readonly respecCount: number;
}

export interface SkillRankModel {
  readonly nodeId: string;
  readonly rank: number;
}

export interface SkillTreeModel {
  readonly progression?: ProgressionContentDefinition;
  readonly nodes: readonly SkillNodeDefinition[];
  readonly tracks: readonly SkillTrackProgressModel[];
  readonly ranks: readonly SkillRankModel[];
  readonly balanceBronze: bigint;
  readonly skillPriority?: readonly string[];
  readonly equipmentSkills?: EquipmentSkillResolution;
}

export interface SkillTreeCallbacks {
  readonly prioritize?: (nodeId:string)=>void;
  readonly purchase: (nodeId: string) => void;
  readonly reset: (track: SkillTrack) => void;
}

export interface SkillTreeNavigation {
  readonly onKey?: (key: string, repeat: boolean) => boolean;
  readonly artwork?: Readonly<Record<string, LoadedAsset>>;
  readonly onNavigate?: (page: 'character' | 'skills' | 'statistics') => void;
  readonly onClose?: () => void;
}

/** Authority remains in subscriptions and callbacks; this host retains presentation only. */
export class SkillTreeUi {
  readonly root: UiRoot;
  private view: UiSkillsElement | null = null;
  private track: SkillTrack = 'explorer';
  private bounds: UiRect | undefined;
  private catalogKey = '';
  constructor(art: UiKitArt, private readonly callbacks: SkillTreeCallbacks, private readonly navigation: SkillTreeNavigation = {}) {
    this.root = new UiRoot({ art, scale: 1, label: 'Skills' });
  }
  get active(): boolean { return this.view !== null; }
  get selectedTrack(): SkillTrack { return this.view?.selectedTrack ?? this.track; }
  selectTrack(track: SkillTrack): void {
    this.track = track; this.root.input.cancelPointers(); this.view?.selectTrack(track); this.root.arrange();
  }
  update(model: SkillTreeModel | null): void {
    if (model === null) {
      this.track = this.selectedTrack; this.root.input.cancelPointers(); this.root.focus.set(null);
      this.view?.dispose(); this.view = null; this.catalogKey = ''; return;
    }
    const catalogKey = JSON.stringify(model.nodes);
    const focused = this.root.focus.current;
    if (this.view && this.catalogKey !== catalogKey) this.root.input.cancelPointers();
    this.catalogKey = catalogKey;
    if (!this.view) {
      this.view = uiSkills({ model, track: this.track, ...this.callbacks, ...this.navigation });
      this.root.mount(this.view); this.applyBounds();
    } else this.view.updateSkills(model);
    this.root.arrange();
    if (focused && focused !== this.root.focus.current) {
      const previous = this.root.entries().find(entry => entry.element.id === focused.id)?.element;
      if (!previous || !this.root.focus.set(previous)) this.view.focusSkills();
      this.root.arrange();
    }
  }
  private applyBounds(): void {
    if (!this.view || !this.bounds) return;
    const frame = this.bounds;
    this.view.setStyle({ position: 'absolute', inset: { left: uiFixed(frame.x), top: uiFixed(frame.y) }, width: uiFixed(frame.width), height: uiFixed(frame.height) });
  }
  setBounds(frame: UiRect, viewportWidth: number, viewportHeight: number): void {
    this.root.resize(viewportWidth, viewportHeight);
    if (!this.bounds || Object.keys(frame).some(key => frame[key as keyof UiRect] !== this.bounds![key as keyof UiRect])) {
      this.bounds = { ...frame }; this.applyBounds();
    }
    this.root.arrange();
  }
  focus(): void { this.view?.setStyle({ visible: true }); this.view?.focusSkills(); this.root.arrange(); }
  draw(context: CanvasRenderingContext2D): void { if (this.active) this.root.drawInContext(context); }
  dispose(): void { this.view = null; this.root.dispose(); }
}
