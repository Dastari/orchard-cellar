import { expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiGameMenu } from './game-menu.js';

it('uses current update state and gates admin, delve and unsupported actions', () => {
  const onAction = vi.fn(), root = new UiRoot({ scale: 1 }); root.resize(320, 400);
  const menu = uiGameMenu({ model: {}, onAction }); root.mount(menu); root.arrange();
  const find = (id: string) => root.entries().map(entry => entry.element).find(node => node.id === `game-menu.${id}`);
  expect(find('developer')).toBeUndefined(); expect(find('exit-delve')).toBeUndefined(); expect(find('update')).toBeUndefined();
  menu.updateGameMenu({ canAdministerWorld: true, delveActive: true, pwaUpdateStatus: 'current' }); root.arrange();
  const update = find('update')!;
  root.focus.set(update, 'keyboard'); root.key({ key: 'Enter' }); expect(onAction).toHaveBeenLastCalledWith('check-update');
  menu.updateGameMenu({ pwaUpdateStatus: 'checking', fullscreenAvailable: false }); root.arrange();
  expect(update.disabled).toBe(true);
  onAction.mockClear(); root.focus.set(update, 'keyboard'); root.key({ key: 'Enter' }); expect(onAction).not.toHaveBeenCalled();
  const fullscreen = find('fullscreen')!; root.focus.set(fullscreen, 'keyboard'); root.key({ key: 'Enter' }); expect(onAction).not.toHaveBeenCalled();
  menu.updateGameMenu({ pwaUpdateStatus: 'available', fullscreen: true }); root.arrange();
  expect(find('update')).toBe(update); expect(fullscreen.props['label']).toBe('Windowed');
  root.focus.set(update, 'keyboard'); root.key({ key: 'Enter' }); expect(onAction).toHaveBeenLastCalledWith('apply-update');
  expect(find('developer')).toBeUndefined(); expect(find('exit-delve')).toBeUndefined();
  root.dispose();
});
