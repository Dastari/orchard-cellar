import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverworldUi, overworldUiLayout, type OverworldUiCallbacks, type OverworldUiItemArt } from './overworld-ui.js';
import type { UiSkin } from './skin.js';
import type { PixelUi } from './pixel-ui.js';
import { renderProtocolBounds } from './world-render-controls.js';
import { changeExperimentalWebGL, EXPERIMENTAL_WEBGL_KEY, readExperimentalWebGL } from './world-backend-setting.js';
function setup(admin: boolean) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
  changeExperimentalWebGL(false);
  const callbacks = new Proxy({}, { get: () => vi.fn() }) as OverworldUiCallbacks;
  const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, callbacks);
  ui.update({ width: 480, height: 270, connected: true, playerCount: 1, selectedSlot: 0,
    inventory: [], hasBackpack: false, audioVolumes: { master: 1, music: 1, sfx: 1 },
    lightingModel: 'unified', lightingQuality: 'dynamic', canAdministerWorld: admin,
    dateLabel: 'SUMMER 1', timeLabel: '17:00', timeFraction: .7, raining: false,
    weatherMode: 'auto', prompt: null, toast: null });
  const click = (bounds: { x: number; y: number }) => { const point = { x: bounds.x + 3, y: bounds.y + 3 }; ui.pointerDown(point, 0); ui.pointerUp(point, 0); };
  return { ui, store, click, layout: overworldUiLayout(480, 270) };
}
afterEach(() => { vi.unstubAllGlobals(); });
describe('experimental renderer is confined to Developer', () => {
  it('toggles and persists from Render, while Video and other developer tabs cannot activate it', () => {
    const { ui, store, click, layout } = setup(true);
    ui.openWindow = 'settings'; click(layout.settingsTabs.video); click(layout.experimentalWebGLButton);
    expect(readExperimentalWebGL()).toBe(false);
    ui.openWindow = 'developer'; click(layout.developerTabs.world); click(layout.experimentalWebGLButton);
    expect(readExperimentalWebGL()).toBe(false);
    click(layout.developerTabs.render); click(layout.experimentalWebGLButton);
    expect(readExperimentalWebGL()).toBe(true); expect(store.get(EXPERIMENTAL_WEBGL_KEY)).toBe('true');
    click(layout.experimentalWebGLButton); expect(store.get(EXPERIMENTAL_WEBGL_KEY)).toBe('false');
  });
  it('does not expose the developer control through an ordinary account', () => {
    const { ui, click, layout } = setup(false);
    ui.openWindow = 'developer'; click(layout.developerTabs.render); click(layout.experimentalWebGLButton);
    expect(readExperimentalWebGL()).toBe(false);
  });
  it.each([[240, 140], [360, 180], [480, 270], [640, 360]])('keeps all four Render controls above the footer at %ix%i', (width, height) => {
    const layout = overworldUiLayout(width, height), content = layout.developerContent;
    const rows = [layout.lightingEffectsButton, layout.orePreviewButton, layout.experimentalWebGLButton, renderProtocolBounds(layout)];
    for (const [i, row] of rows.entries()) {
      expect(row.x).toBeGreaterThanOrEqual(content.x); expect(row.x + row.width).toBeLessThanOrEqual(content.x + content.width);
      expect(row.y).toBeGreaterThanOrEqual(content.y + 23); expect(row.y + row.height).toBeLessThanOrEqual(content.y + content.height - 17);
      if (i > 0) expect(rows[i - 1]!.y + rows[i - 1]!.height).toBeLessThanOrEqual(row.y);
    }
  });
});
