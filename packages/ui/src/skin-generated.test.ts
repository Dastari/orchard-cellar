import { describe, expect, it, vi } from 'vitest';

const loadGeneratedAsset = vi.hoisted(() => vi.fn(async (name: string, season: string) => ({ name, season })));

vi.mock('./assets.js', () => ({ loadGeneratedAsset }));

import { loadUiGeneratedSkin } from './skin.js';

describe('generated UI skin selection', () => {
  it('loads only the requested production atlas families', async () => {
    await expect(loadUiGeneratedSkin(['panelWood', 'selectorDeny'])).resolves.toEqual({
      panelWood: { name: 'ui_cf_panel_wood', season: 'summer' },
      selectorDeny: { name: 'ui_cf_selector_deny', season: 'summer' },
    });
    expect(loadGeneratedAsset).toHaveBeenCalledTimes(2);
  });
});
