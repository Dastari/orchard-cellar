import { pwaUpdateLabel, type PwaUpdateStatus } from '../../pwa-update.js';
import type { UiStyle } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
import type { UiTone } from '../tokens.js';
import { uiButton } from './button.js';
import { uiFrame } from './frame.js';
import { uiScrollArea } from './layout.js';

export type UiGameMenuAction = 'resume' | 'settings' | 'help' | 'developer' | 'fullscreen'
  | 'check-update' | 'apply-update' | 'exit-delve' | 'sign-out' | 'quit';
export interface UiGameMenuModel {
  readonly canAdministerWorld?: boolean;
  readonly fullscreen?: boolean;
  readonly fullscreenAvailable?: boolean;
  readonly pwaUpdateStatus?: PwaUpdateStatus;
  readonly delveActive?: boolean;
}
export interface UiGameMenuOptions {
  readonly model: UiGameMenuModel;
  readonly onAction: (action: UiGameMenuAction) => void;
  readonly layout?: UiStyle;
}
export interface UiGameMenuElement extends UiElement { updateGameMenu(model: UiGameMenuModel): void }

/** Stable controls read current authority when activated, including after focus changes. */
export function uiGameMenu(options: UiGameMenuOptions): UiGameMenuElement {
  let model = options.model;
  const status = () => model.pwaUpdateStatus ?? 'unsupported';
  const definitions: readonly { id: string; label: () => string; tone: () => UiTone;
    action: () => UiGameMenuAction; visible?: () => boolean; disabled?: () => boolean }[] = [
    { id: 'resume', label: () => 'RETURN TO WORLD', tone: () => 'success', action: () => 'resume' },
    { id: 'settings', label: () => 'SETTINGS', tone: () => 'primary', action: () => 'settings' },
    { id: 'help', label: () => 'HELP', tone: () => 'primary', action: () => 'help' },
    { id: 'developer', label: () => 'DEVELOPER', tone: () => 'warning', action: () => 'developer', visible: () => model.canAdministerWorld === true },
    { id: 'fullscreen', label: () => model.fullscreen && model.fullscreenAvailable !== false ? 'WINDOWED' : 'FULLSCREEN', tone: () => 'info', action: () => 'fullscreen', disabled: () => model.fullscreenAvailable === false },
    { id: 'update', label: () => pwaUpdateLabel(status()), tone: () => status() === 'available' ? 'success' : 'primary', action: () => status() === 'available' ? 'apply-update' : 'check-update', visible: () => status() !== 'unsupported', disabled: () => status() === 'checking' || status() === 'updating' },
    { id: 'exit-delve', label: () => 'EXIT DELVE', tone: () => 'danger', action: () => 'exit-delve', visible: () => model.delveActive === true },
    { id: 'sign-out', label: () => 'SIGN OUT', tone: () => 'danger', action: () => 'sign-out' },
    { id: 'quit', label: () => 'QUIT TO TITLE', tone: () => 'danger', action: () => 'quit' },
  ];
  const buttons = definitions.map(definition => uiButton({ id: `game-menu.${definition.id}`,
    label: definition.label(), tone: definition.tone(), layout: { width: 'grow', shrink: 0 },
    onPress: () => {
      if (definition.visible?.() === false || definition.disabled?.()) return;
      options.onAction(definition.action());
    },
  }));
  const frame = uiFrame({ id: 'game.menu', header: { title: 'GAME MENU', closable: true, onClose: () => options.onAction('resume') },
    layout: { width: 'grow', height: 'grow', ...options.layout },
    children: [uiScrollArea({ gap: 4 }, buttons)],
  });
  const updateGameMenu = (next: UiGameMenuModel) => {
    model = next;
    definitions.forEach((definition, index) => {
      buttons[index]!.setStyle({ visible: definition.visible?.() ?? true });
      buttons[index]!.setProps({ label: definition.label(), tone: definition.tone() }).setDisabled(definition.disabled?.() ?? false);
    });
  };
  updateGameMenu(model);
  return Object.assign(frame, { updateGameMenu });
}
