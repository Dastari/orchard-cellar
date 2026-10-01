import { createCanvas } from '@napi-rs/canvas';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { UiRoot, type UiKitArt } from '@orchard/ui/studio';
import { uiTestArt } from '../../../ui/src/kit/lab/testing/art.js';
import { uiElementTextContrast } from '../../../ui/src/kit/components/art.js';
import { uiContrastRatio } from '../../../ui/src/kit/skin/contrast.js';
import { StudioShellApp } from './app.js';
import { StudioShellController } from './controller.js';
import { studioConnectionStatus } from './connection-status.js';
import type { StudioConnectionPhase } from './session.js';

let art: UiKitArt;
beforeAll(async () => {
  art = await uiTestArt();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

function shell(phase: StudioConnectionPhase, error = 'The live connection failed. Try again.') {
  const controller = new StudioShellController(async () => { throw new Error('local fixture'); }, null);
  controller.chooseEnvironment('local');
  if (phase === 'connecting') controller.session.beginConnect();
  if (phase === 'connected') controller.session.connected({ identity: 'local-fixture', role: 'admin', contentRevision: null, mapRevision: null });
  if (phase === 'error') controller.session.failed(error);
  const app = new StudioShellApp({ style: {} } as HTMLCanvasElement, controller);
  const mounted = vi.spyOn(UiRoot.prototype, 'mount');
  (app as unknown as { buildShell(): void }).buildShell();
  const node = mounted.mock.calls.at(-1)![0]; mounted.mockRestore();
  return { app, controller, node };
}

function dominantColour(pixels: Uint8ClampedArray): string {
  const counts = new Map<string, number>();
  for (let i = 0; i < pixels.length; i += 4) {
    const colour = `#${[pixels[i], pixels[i + 1], pixels[i + 2]].map(value => value!.toString(16).padStart(2, '0')).join('')}`;
    counts.set(colour, (counts.get(colour) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]![0];
}

describe('Studio startup status (BUG-085)', () => {
  it.each(['anonymous', 'connecting', 'error'] as const)('paints readable status text for %s on the actual shell', phase => {
    const { node, app } = shell(phase);
    const root = new UiRoot({ art, scale: 2 }); root.resize(1280, 800); root.mount(node); root.arrange();
    try {
      const target = createCanvas(1280, 800), context = target.getContext('2d');
      root.draw(context as unknown as CanvasRenderingContext2D);
      const texts = root.entries().map(entry => entry.element).filter(element => element.kind === 'text' && element.clip.height > 0);
      expect(texts.length).toBeGreaterThanOrEqual(2);
      for (const text of texts) {
        const r = text.rect;
        const paintedFace = dominantColour(context.getImageData(Math.round(r.x * 2), Math.round(r.y * 2), Math.max(1, Math.floor(r.width * 2)), Math.max(1, Math.floor(r.height * 2))).data);
        expect(uiContrastRatio(paintedFace, uiElementTextContrast(text).color), text.label).toBeGreaterThanOrEqual(4.5);
      }
    } finally { root.unmount(node); root.dispose(); app.dispose(); }
  });

  it.each([[390, 844], [720, 540], [1280, 800]])('wraps a long failure and keeps Retry reachable at %i×%i', (width, height) => {
    const { node, app, controller } = shell('error', 'The live connection could not load the published world. Your account may need access, or the server may be unavailable. Retry the connection after checking your access.');
    const root = new UiRoot({ scale: 2 }); root.resize(width!, height!); root.mount(node); root.arrange();
    try {
      const retry = root.entries().find(entry => entry.element.id === 'studio-retry')!.element;
      const detail = root.entries().find(entry => entry.element.id === 'studio-connection-detail')!.element;
      expect(detail).toBeDefined(); expect(detail.clip).toEqual(detail.rect);
      expect(retry.clip).toEqual(retry.rect); expect(retry.rect.width).toBeGreaterThan(0);
      const reconnect = vi.spyOn(controller, 'connectExplicit').mockResolvedValue();
      root.focus.set(retry); root.key({ key: 'Enter' });
      expect(reconnect).toHaveBeenCalledOnce();
    } finally { root.unmount(node); root.dispose(); app.dispose(); }
  });

  it('labels a connected session waiting for its map accurately and retains explicit reconnect', () => {
    const node = studioConnectionStatus({ phase: 'connected', error: null }, () => {}, 'Waiting for the live map');
    const root = new UiRoot(); root.resize(1280, 800); root.mount(node); root.arrange();
    try {
      const labels = root.entries().map(entry => entry.element.label);
      expect(labels).toContain('Loading published map');
      expect(labels).toContain('Waiting for the live map');
      expect(labels).toContain('Reconnect');
      expect(labels).not.toContain('Retry sign in');
    } finally { root.unmount(node); root.dispose(); }
  });

  it('does not offer a second connection while a connection is in progress', () => {
    const { node, app } = shell('connecting');
    const root = new UiRoot(); root.resize(1280, 800); root.mount(node); root.arrange();
    try { expect(root.entries().some(entry => entry.element.id === 'studio-retry')).toBe(false); }
    finally { root.unmount(node); root.dispose(); app.dispose(); }
  });
});
