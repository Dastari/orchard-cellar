import { scrollUiElement } from '../layout/scroll.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UiElement } from '../runtime/element.js';
import { uiButton } from './button.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiTooltip } from './tooltip.js';
export interface UiOnlinePlayer {
  readonly id: string; readonly label: string; readonly idle?: boolean; readonly manageable?: boolean;
}
export interface UiOnlinePlayersOptions {
  readonly id?: string; readonly players: readonly UiOnlinePlayer[];
  readonly onCycleRole?: (id: string) => void; readonly onRemove?: (id: string) => void;
  readonly onClose: () => void; readonly layout?: UiStyle;
}
/** Host authority supplies labels and permission. Updating players retains rows,
 * focus and scroll; both management actions are keyboard reachable. */
export function uiOnlinePlayers(options: UiOnlinePlayersOptions): UiElement {
  const rows = new Map<string, { row: UiElement; button: UiElement; remove: UiElement; player: UiOnlinePlayer }>();
  const title = uiText('ONLINE PLAYERS', { overflow: 'ellipsis', layout: { width: 'grow' } });
  const list = uiScrollArea({ width: 'grow', height: 'grow', gap: 2 });
  const empty = uiText('No players online.', { wrap: true });
  const frame = uiFrame({ style: 'wood_parchment', blockInput: true,
    header: { title: 'Online players', content: title, closable: true, onClose: options.onClose },
    layout: { width: 'grow', height: 'grow' }, children: [list],
  });
  const root = new UiElement({ id: options.id, kind: 'online-players', props: { players: options.players },
    style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout }, children: [frame],
    onDismiss: () => options.onClose(),
    measure(element) {
      const players = element.props['players'] as readonly UiOnlinePlayer[];
      const heading = `ONLINE PLAYERS · ${players.length}`;
      if (title.label !== heading) title.setProps({ text: heading });
      const ids = new Set(players.map(player => player.id));
      for (const [id, entry] of rows) if (!ids.has(id)) { entry.row.dispose(); rows.delete(id); }
      const children: UiElement[] = [];
      for (const player of players) {
        let entry = rows.get(player.id);
        if (!entry) {
          const current = () => rows.get(player.id)?.player ?? player;
          const button = uiButton({ id: `${element.id}:player:${player.id}`, label: player.label, tone: 'primary',
            onPress: () => { if (current().manageable) options.onCycleRole?.(player.id); },
            layout: { width: 'grow', height: 'grow' } });
          const pointer = button.hooks.onPointer!;
          let drag: { y: number; start: number; moved: boolean } | null = null;
          Object.assign(button.hooks, { onPointer: (event: Parameters<typeof pointer>[0], node: UiElement) => {
            if (event.type === 'down' && event.button === 0) drag = { y: event.point.y, start: list.scroll.y, moved: false };
            if (event.type === 'move' && drag && (drag.moved || Math.abs(event.point.y - drag.y) >= 4)) {
              drag.moved = true; scrollUiElement(list, list.scroll.x, drag.start + drag.y - event.point.y); return true;
            }
            if (event.type === 'up' || event.type === 'cancel') {
              const moved = drag?.moved; drag = null;
              if (moved) return pointer({ ...event, type: 'cancel' }, node);
            }
            return pointer(event, node);
          }, onContextMenu: () => { if (current().manageable) options.onRemove?.(player.id); return true; } });
          const remove = uiButton({ id: `${element.id}:remove:${player.id}`, label: 'X', tone: 'danger',
            ariaLabel: `Remove ${player.label}`, onPress: () => { if (current().manageable) options.onRemove?.(player.id); },
            layout: { width: uiFixed(24), height: 'grow', shrink: 0 } });
          const row = uiFlex({ direction: 'row', width: 'grow', height: uiFixed(28), shrink: 0, gap: 2, padding: { right: 8 } }, [
            uiTooltip(() => current().manageable ? `${current().label} · Activate to cycle role; right-click or Remove to remove.` : current().label,
              button, { width: 'grow', height: 'grow' }), remove,
          ]);
          entry = { row, button, remove, player }; rows.set(player.id, entry);
        }
        entry.player = player;
        if (entry.button.props['label'] !== player.label) entry.button.setProps({ label: player.label });
        entry.button.label = player.manageable ? `${player.label} · Cycle role` : player.label;
        entry.remove.label = `Remove ${player.label}`;
        const display = player.manageable ? 'flex' : 'none';
        if (entry.remove.style.display !== display) entry.remove.setStyle({ display });
        children.push(entry.row);
      }
      if (!players.length) children.push(empty);
      if (children.length !== list.children.length || children.some((child, index) => list.children[index] !== child)) list.replaceChildren(children);
      return { min: { width: 0, height: 0 }, preferred: { width: 300, height: 90 + Math.max(1, players.length) * 30 } };
    },
  });
  return root;
}
