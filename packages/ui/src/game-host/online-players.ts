import type { UiRect } from '../geometry.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiOnlinePlayers } from '../kit/components/online-players.js';
import { uiFixed } from '../kit/layout/box.js';
import { scrollUiElement } from '../kit/layout/scroll.js';
import { UiElement, type UiElementKey } from '../kit/runtime/element.js';
import { UiRoot } from '../kit/runtime/root.js';

export type OnlinePlayerRole = 'guest' | 'worker' | 'builder' | null;
export interface GameOnlinePlayer {
  readonly identityHex: string; readonly displayName: string; readonly self: boolean;
  /** Authoritative client projection, including the existing ten-minute threshold. */
  readonly idleMinutes: number | null; readonly homesteadRole: OnlinePlayerRole;
}
export interface GameOnlinePlayersModel {
  /** Current identity + connection generation + space; never credentials. */
  readonly scopeKey: string; readonly identityHex: string | null;
  readonly visible: boolean; readonly canManage: boolean; readonly players: readonly GameOnlinePlayer[];
}
export interface OnlinePlayerManagementRequest {
  readonly scopeKey: string; readonly expectedIdentityHex: string; readonly expectedRole: OnlinePlayerRole;
  /** Root rechecks authority, then cycles via its existing helper or removes with kick=true. */
  readonly intent: 'cycle' | 'remove';
}
export interface GameOnlinePlayersCommands {
  readonly onManage: (request: OnlinePlayerManagementRequest) => void;
  readonly onClose: () => void;
  /** Opens a whisper to that player's name; rows offer it only when supplied and never for yourself. */
  readonly onWhisper?: (displayName: string) => void;
}

/** Roster composition only. Membership authority, role cycling, transport and
 * error/rejection reporting remain in the game's existing command boundary. */
export class GameOnlinePlayers {
  readonly root: UiRoot;
  private readonly view: ReturnType<typeof uiOnlinePlayers>;
  private readonly stage: UiElement;
  private model: GameOnlinePlayersModel | null = null;
  private commandKey = '';
  private closed = false;
  private disposed = false;
  constructor(art: UiKitArt, private readonly commands: GameOnlinePlayersCommands) {
    this.root = new UiRoot({ art, scale: 1, label: 'Online players' });
    this.view = uiOnlinePlayers({ id: 'game.online-players', players: [], removeActionLabel: 'Remove and kick', onClose: () => this.close(),
      onCycleRole: id => this.manage(id, 'cycle'), onRemove: id => this.manage(id, 'remove'),
      onWhisper: commands.onWhisper ? id => this.whisper(id) : undefined,
      layout: { zLayer: 'modal', visible: false },
    });
    // The window fits its rows and centres inside the host-supplied bounds, which cap it.
    this.stage = new UiElement({ id: 'game.online-players.stage', style: { display: 'flex', justify: 'center', align: 'center', position: 'absolute' }, children: [this.view] });
    this.root.mount(new UiElement({ id: 'game.online-players.host', style: { display: 'stack', width: 'grow', height: 'grow' },
      children: [this.stage], onKeyCapture: event => this.key(event) }));
  }
  get active(): boolean { return !this.disposed && this.model?.visible === true && !this.closed; }
  update(model: GameOnlinePlayersModel | null): void {
    if (this.disposed) return;
    const scopeChanged = model?.scopeKey !== this.model?.scopeKey || model?.identityHex !== this.model?.identityHex;
    if (scopeChanged || model?.visible !== this.model?.visible) this.closed = false;
    const key = model ? JSON.stringify([model.scopeKey, model.identityHex, model.visible, model.canManage,
      model.players.map(player => [player.identityHex, player.homesteadRole, player.self])]) : '';
    if (key !== this.commandKey) { this.root.input.cancelPointers(); this.commandKey = key; }
    if (scopeChanged || !model?.visible) {
      this.root.focus.set(null);
      const reset = (node: UiElement): void => { scrollUiElement(node, 0, 0); node.children.forEach(reset); };
      reset(this.view);
    }
    this.model = model;
    // Closed intervals stay closed until the controlled host becomes active again.
    this.view.setStyle({ visible: this.active });
    if (model) this.view.setProps({ players: model.players.map(player => ({ id: player.identityHex,
      label: `${player.displayName}${player.self ? '  (YOU)' : ''}${player.idleMinutes === null ? '' : `  (idle ${player.idleMinutes} min)`}${player.homesteadRole === null ? '' : `  [${player.homesteadRole.toUpperCase()}]`}`,
      name: player.displayName, self: this.isSelf(player),
      caption: this.isSelf(player) ? 'You' : player.homesteadRole === null ? '' : player.homesteadRole[0]!.toUpperCase() + player.homesteadRole.slice(1),
      status: player.idleMinutes === null ? '' : `Idle ${player.idleMinutes} min`,
      idle: player.idleMinutes !== null, manageable: this.manageable(player), whisper: !this.isSelf(player) && player.identityHex !== '',
    })) });
    this.root.arrange();
  }
  setBounds(frame: UiRect, viewportWidth: number, viewportHeight: number): void {
    const changed = this.view.rect.x !== frame.x || this.view.rect.y !== frame.y
      || this.view.rect.width !== frame.width || this.view.rect.height !== frame.height;
    this.root.resize(viewportWidth, viewportHeight);
    this.stage.setStyle({ inset: { left: uiFixed(frame.x), top: uiFixed(frame.y) },
      width: uiFixed(Math.max(0, frame.width)), height: uiFixed(Math.max(0, frame.height)) });
    this.view.setStyle({ maxWidth: uiFixed(Math.max(0, frame.width)), maxHeight: uiFixed(Math.max(0, frame.height)) });
    // The rows scroll inside the window; the chrome (ribbon, padding) keeps the rest of the bounds.
    this.view.setListMaxHeight(Math.max(18, frame.height - 56));
    this.root.arrange();
    if (changed) this.revealFocused();
  }
  private revealFocused(): void {
    // The same retained row remains focused; do not reset deliberate scroll every update.
    const focused = this.root.focus.current;
    if (!focused) return;
    let rect = focused.rect;
    for (let parent = focused.parent; parent; parent = parent.parent) {
      const bounds = parent.contentRect;
      const y = rect.y < bounds.y ? rect.y - bounds.y : Math.max(0, rect.y + rect.height - bounds.y - bounds.height);
      const old = parent.scroll.y; scrollUiElement(parent, parent.scroll.x, old + y);
      rect = { ...rect, y: rect.y - (parent.scroll.y - old) };
    }
    this.root.arrange();
  }
  private isSelf(player: GameOnlinePlayer): boolean {
    return player.self || (this.model?.identityHex != null && player.identityHex === this.model.identityHex);
  }
  private whisper(identityHex: string): void {
    const player = this.model?.players.find(candidate => candidate.identityHex === identityHex);
    if (!this.active || !player || this.isSelf(player)) return;
    this.commands.onWhisper?.(player.displayName);
  }
  private manageable(player: GameOnlinePlayer): boolean {
    return this.active && this.model?.canManage === true && this.model.identityHex !== null
      && player.identityHex !== '' && !player.self && player.identityHex !== this.model.identityHex;
  }
  private manage(identityHex: string, intent: OnlinePlayerManagementRequest['intent']): void {
    const player = this.model?.players.find(candidate => candidate.identityHex === identityHex);
    if (!player || !this.manageable(player)) return;
    this.commands.onManage({ scopeKey: this.model!.scopeKey, expectedIdentityHex: identityHex, expectedRole: player.homesteadRole, intent });
  }
  private close(): void {
    if (!this.active) return;
    this.closed = true; this.root.input.cancelPointers(); this.root.focus.set(null); this.view.setStyle({ visible: false }); this.commands.onClose();
  }
  private key(event: UiElementKey): boolean {
    if (!this.active) return false;
    if (event.repeat && ['Enter', ' ', 'Escape'].includes(event.key)) return true;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    // Escape closes the roster even while a row's tooltip is showing.
    if (event.key === 'Escape') { this.close(); return true; }
    const list = this.root.entries().find(entry => entry.element.id === 'game.online-players:list')?.element;
    if (list && (event.key === 'PageDown' || event.key === 'PageUp')) {
      scrollUiElement(list, list.scroll.x, list.scroll.y + (event.key === 'PageDown' ? 1 : -1) * list.contentRect.height); return true;
    }
    const rows = this.root.entries().filter(entry => entry.element.focusGroup === 'game.online-players:rows').map(entry => entry.element);
    const current = this.root.focus.current;
    if (rows.length && (event.key === 'Home' || event.key === 'End' || !rows.includes(current!) && ['ArrowUp', 'ArrowDown'].includes(event.key))) {
      this.root.focus.set(event.key === 'End' || event.key === 'ArrowUp' ? rows.at(-1)! : rows[0]!); this.root.arrange(); return true;
    }
    return false;
  }
  draw(context: CanvasRenderingContext2D): void { if (this.active) this.root.drawInContext(context); }
  dispose(): void { this.disposed = true; this.model = null; this.root.dispose(); }
}
