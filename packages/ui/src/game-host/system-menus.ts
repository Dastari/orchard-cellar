import type { UiRect } from '../geometry.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiGameMenu, type UiGameMenuElement, type UiGameMenuAction, type UiGameMenuModel } from '../kit/components/game-menu.js';
import { uiSettings, UI_SETTINGS_TABS, type UiSettingsElement, type UiSettingsModel, type UiSettingsOptions, type UiSettingsTab } from '../kit/components/settings.js';
import { uiDeveloper, type UiDeveloperElement, type UiDeveloperModel, type UiDeveloperAction } from '../kit/components/developer.js';
import { UiElement } from '../kit/runtime/element.js';
import { UiRoot } from '../kit/runtime/root.js';
import { uiFixed } from '../kit/layout/box.js';

export type SystemMenuWindow = 'system' | 'settings' | 'developer';
export type SystemMenuModel = UiGameMenuModel & UiSettingsModel & UiDeveloperModel & {
  readonly window: SystemMenuWindow | null;
  readonly frame: UiRect;
  readonly width: number;
  readonly height: number;
};
export interface SystemMenuCommands {
  readonly action: (action: UiGameMenuAction | UiDeveloperAction) => void;
  readonly close: () => void;
  readonly back: () => void;
  readonly key: (code: string) => boolean;
  readonly volume: UiSettingsOptions['onVolume'];
  readonly mute: UiSettingsOptions['onMute'];
  readonly background: UiSettingsOptions['onBackground'];
  readonly nameplates: UiSettingsOptions['onNameplates'];
  readonly lighting: NonNullable<UiSettingsOptions['onLightingMode']>;
  readonly worldScale: NonNullable<UiSettingsOptions['onWorldScale']>;
  readonly presentationCap: NonNullable<UiSettingsOptions['onPresentationCap']>;
  readonly experimentalWebGL: NonNullable<UiSettingsOptions['onExperimentalWebGL']>;
  readonly touch: NonNullable<UiSettingsOptions['onTouchPreferences']>;
  readonly time: (fraction: number) => void;
}

/** Production menu adapter: all preference and world writes remain host commands. */
export class SystemMenus {
  readonly root: UiRoot;
  private window: SystemMenuWindow | null = null;
  private view: UiGameMenuElement | UiSettingsElement | UiDeveloperElement | null = null;
  private model: SystemMenuModel | null = null;
  private bounds: UiRect | null = null;
  private settingsTab: UiSettingsTab = 'gameplay';
  private developerTab: 'world' | 'render' = 'world';
  constructor(art: UiKitArt, private readonly commands: SystemMenuCommands) {
    this.root = new UiRoot({ art, scale: 1, label: 'Game menus' });
  }
  get active(): boolean { return this.window !== null; }
  get selectedSettingsTab(): UiSettingsTab { return this.settingsTab; }
  get selectedDeveloperTab(): 'world' | 'render' { return this.developerTab; }
  update(model: SystemMenuModel): void {
    if (this.model && (this.model.canAdministerWorld !== model.canAdministerWorld
      || this.model.delveActive !== model.delveActive || this.model.pwaUpdateStatus !== model.pwaUpdateStatus)) this.root.input.cancelPointers();
    this.model = model;
    const window = model.window === 'developer' && !model.canAdministerWorld ? 'system' : model.window;
    const changed = window !== this.window;
    if (changed) {
      this.root.input.cancelPointers(); this.root.focus.set(null);
      for (const child of [...this.root.tree.children]) child.dispose();
      this.window = window; this.view = null; this.bounds = null;
    }
    this.root.resize(model.width, model.height);
    if (window === null) return;
    if (!this.view) {
      if (window === 'system') this.view = uiGameMenu({ model, onAction: action => this.commands.action(action) });
      else if (window === 'settings') this.view = uiSettings({ model, tab: this.settingsTab,
        onTab: tab => { this.settingsTab = tab; }, onBack: this.commands.back,
        onVolume: this.commands.volume, onMute: this.commands.mute, onBackground: this.commands.background,
        onNameplates: this.commands.nameplates, onLighting: mode => this.commands.lighting(mode === 'unified' ? 'dynamic' : 'classic'),
        onLightingMode: this.commands.lighting, onWorldScale: this.commands.worldScale,
        onPresentationCap: this.commands.presentationCap, onExperimentalWebGL: this.commands.experimentalWebGL,
        onTouchPreferences: this.commands.touch });
      else this.view = uiDeveloper({ model, tab: this.developerTab, availableTabs: ['world', 'render'],
        onTab: tab => { if (tab === 'world' || tab === 'render') this.developerTab = tab; },
        onBack: this.commands.back, onAction: action => { if (this.model?.canAdministerWorld) this.commands.action(action); },
        onTime: value => { if (this.model?.canAdministerWorld) this.commands.time(value); } });
      this.root.mount(new UiElement({ id: 'game.system-host', style: { display: window === 'developer' ? 'stack' : 'flex', justify: 'center', align: 'center', width: 'grow', height: 'grow', zLayer: 'modal' },
        props: { singlePointer: true, touchScroll: true }, children: [this.view], pointerMode: 'capture', onPointer: () => true,
        onKeyCapture: event => {
          if (event.repeat && (event.key === 'Enter' || event.key === ' ')) return true;
          if (this.root.focus.current?.props['selectionControl']) return false;
          const key = event.key.toLowerCase();
          if (['i', 'c', 'p', 'k', 'o', 'l'].includes(key)) { if (!event.repeat) this.commands.key(`Key${key.toUpperCase()}`); return true; }
          return false;
        },
        onKey: event => {
          if (event.key === 'Escape') { if (!event.repeat) (this.window === 'system' ? this.commands.close : this.commands.back)(); return true; }
          if (this.window === 'settings' && this.settingsTab === 'gameplay' && event.key.toLowerCase() === 'n') {
            if (!event.repeat) (this.view as UiSettingsElement).toggleNameplates(); return true;
          }
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
          const direction = event.key === 'ArrowUp' ? -1 : 1;
          if (this.window === 'settings') {
            const index = UI_SETTINGS_TABS.indexOf(this.settingsTab);
            (this.view as UiSettingsElement).selectSettingsTab(UI_SETTINGS_TABS[(index + direction + UI_SETTINGS_TABS.length) % UI_SETTINGS_TABS.length]!);
          } else if (this.window === 'developer') (this.view as UiDeveloperElement).selectDeveloperTab(this.developerTab === 'world' ? 'render' : 'world');
          else return false;
          return true;
        },
      }));
    }
    if (window === 'system') (this.view as UiGameMenuElement).updateGameMenu(model);
    else if (window === 'settings') { (this.view as UiSettingsElement).updateSettings(model); (this.view as UiSettingsElement).setSettingsViewport(model.width, model.height); }
    else (this.view as UiDeveloperElement).updateDeveloper(model);
    const width = Math.max(0, Math.min(model.frame.width, model.width - 8)), height = Math.max(0, Math.min(model.frame.height, model.height - 8));
    const frame = { x: Math.max(0, (model.width - width) / 2), y: Math.max(0, (model.height - height) / 2), width, height };
    if (!this.bounds || Object.keys(frame).some(key => frame[key as keyof UiRect] !== this.bounds![key as keyof UiRect])) {
      this.bounds = frame;
      // The approved menu and settings windows fit their content, centred and capped by the viewport;
      // the developer tools keep the fixed progression frame.
      if (window === 'developer') this.view.setStyle({ position: 'absolute', inset: { left: uiFixed(frame.x), top: uiFixed(frame.y) }, width: uiFixed(frame.width), height: uiFixed(frame.height) });
      else this.view.setStyle({ maxWidth: uiFixed(Math.max(0, model.width - 8)), maxHeight: uiFixed(Math.max(0, model.height - 8)) });
    }
    this.root.arrange();
    if (changed) this.focus();
  }
  focus(): void {
    const node = this.root.entries().find(({ element }) => element.focusable && !element.disabled)?.element;
    if (node) this.root.focus.set(node);
  }
  draw(context: CanvasRenderingContext2D): void { if (this.active) this.root.drawInContext(context); }
  dispose(): void { this.root.dispose(); this.view = null; this.window = null; }
}
