import { pwaUpdateLabel, type PwaUpdateStatus } from '../../pwa-update.js';
import type { UiStyle } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import { uiChoiceButton } from './social.js';
import { uiWindow } from './window.js';
type UiMenuTone = 'primary' | 'success' | 'danger';
/** The update action in the menu's sentence case (the approved mock reads "Check for update"). */
function menuUpdateLabel(status: PwaUpdateStatus): string {
  return ({ available: 'Update now', checking: 'Checking', updating: 'Updating', current: 'Check for update', error: 'Retry update', unsupported: 'Update unavailable' } as const)[status] ?? pwaUpdateLabel(status);
}

export type UiGameMenuAction = 'resume' | 'settings' | 'help' | 'developer' | 'fullscreen'
  | 'check-update' | 'apply-update' | 'exit-delve' | 'sign-out' | 'quit' | 'outdoor-rewards';
export interface UiGameMenuModel {
  readonly outdoorRewardCount?: number;
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

/** Approved game menu: a compact MENU window of choice buttons (Resume in green, leaving actions in red).
 * Stable controls read current authority when activated, including after focus changes. */
export function uiGameMenu(options: UiGameMenuOptions): UiGameMenuElement {
  let model = options.model;
  const status = () => model.pwaUpdateStatus ?? 'unsupported';
  const definitions: readonly { id: string; label: () => string; tone: () => UiMenuTone;
    action: () => UiGameMenuAction; visible?: () => boolean; disabled?: () => boolean }[] = [
    { id: 'resume', label: () => 'Resume', tone: () => 'success', action: () => 'resume' },
    { id: 'outdoor-rewards', label: () => `Rewards (${model.outdoorRewardCount ?? 0})`, tone: () => 'success', action: () => 'outdoor-rewards', visible: () => model.outdoorRewardCount !== undefined },
    { id: 'settings', label: () => 'Settings', tone: () => 'primary', action: () => 'settings' },
    { id: 'help', label: () => 'Help', tone: () => 'primary', action: () => 'help' },
    { id: 'developer', label: () => 'Developer', tone: () => 'primary', action: () => 'developer', visible: () => model.canAdministerWorld === true },
    { id: 'fullscreen', label: () => model.fullscreen && model.fullscreenAvailable !== false ? 'Windowed' : 'Fullscreen', tone: () => 'primary', action: () => 'fullscreen', disabled: () => model.fullscreenAvailable === false },
    { id: 'update', label: () => menuUpdateLabel(status()), tone: () => status() === 'available' ? 'success' : 'primary', action: () => status() === 'available' ? 'apply-update' : 'check-update', visible: () => status() !== 'unsupported', disabled: () => status() === 'checking' || status() === 'updating' },
    { id: 'exit-delve', label: () => 'Exit delve', tone: () => 'danger', action: () => 'exit-delve', visible: () => model.delveActive === true },
    { id: 'sign-out', label: () => 'Sign out', tone: () => 'danger', action: () => 'sign-out' },
    { id: 'quit', label: () => 'Quit to title', tone: () => 'danger', action: () => 'quit' },
  ];
  const buttons = definitions.map(definition => uiChoiceButton({ id: `game-menu.${definition.id}`,
    label: definition.label(), tone: definition.tone(), layout: { width: 'grow' },
    onPress: () => {
      if (definition.visible?.() === false || definition.disabled?.()) return;
      options.onAction(definition.action());
    },
  }));
  const frame = uiWindow({ id: 'game.menu', title: 'MENU', closeLabel: 'Resume', onClose: () => options.onAction('resume'),
    layout: { direction: 'column', gap: 2, width: uiFixed(150) }, children: buttons });
  if (options.layout) frame.setStyle(options.layout);
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
