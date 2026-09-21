import { expect, it, vi } from 'vitest';
vi.mock('../../pixel-ui.js', () => ({ loadPixelUi: vi.fn(async () => ({ font: 'body', headerFont: 'header' })) }));
vi.mock('../skin/load.js', () => ({ loadKitSkin: vi.fn(async (families: readonly string[]) => Object.fromEntries(families.map(family => [family, { loaded: true }]))) }));
vi.mock('../../skin.js', () => ({ UI_ICON_NAMES: ['box', 'heart'], loadUiIconSet: vi.fn(async (names: readonly string[]) => Object.fromEntries(names.map(name => [name, { loaded: true }]))) }));
import { loadKitSkin } from '../skin/load.js';
import { loadUiIconSet } from '../../skin.js';
import { loadUiKitArt } from './art.js';
it('loads only startup families and explicitly requested icons while retaining default full loading', async () => {
  const small = await loadUiKitArt({ families: ['frame','meter','feedback'], icons: [] });
  expect(loadKitSkin).toHaveBeenLastCalledWith(['frame','meter','feedback']);
  expect(loadUiIconSet).toHaveBeenLastCalledWith([]);
  expect(small.skin.button).toEqual({}); expect(small.icons).toEqual({});
  await loadUiKitArt();
  expect(vi.mocked(loadKitSkin).mock.calls.at(-1)?.[0]).toHaveLength(12);
  expect(loadUiIconSet).toHaveBeenLastCalledWith(['box','heart']);
});
