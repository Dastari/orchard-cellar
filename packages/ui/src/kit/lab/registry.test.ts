import { SKILL_NODE_DEFINITIONS } from '@orchard/sim';
import { UI_CHARACTER_PORTRAIT_ASSETS } from '../components/character-portrait.js';
import { itemDefinition } from '@orchard/sim';
import { UI_LAB_ITEM_KINDS } from './inventory-mock.js';
import { uiElementEnabled } from '../runtime/element.js';
import { uiTopModal } from '../runtime/layers.js';
/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ui, type UiKitArt } from '../components/index.js';
import { UiRoot } from '../runtime/root.js';
import type { CanvasTextEditor } from '../runtime/text-editor.js';
import { createUiRecordingCanvas } from '../runtime/recording-canvas.js';
import { UI_LAB_SPECIMENS, uiLabVariants } from './registry.js';
import { uiTestAsset, uiTestArt } from './testing/art.js';
let art: UiKitArt;
const actorAssets = new Map<string, ReturnType<typeof uiTestAsset>>();
beforeAll(async () => { art = await uiTestArt(); for (const name of ['tile_cf_grass', 'tile_cf_stone_cliff_variants']) actorAssets.set(name, uiTestAsset(name, 'tiles')); const actor = uiTestAsset('npc_cf_desert_person_01', 'characters'); actorAssets.set(actor.name, actor); for (const node of SKILL_NODE_DEFINITIONS) actorAssets.set(node.iconAsset,uiTestAsset(node.iconAsset,'ui')); for (const name of UI_CHARACTER_PORTRAIT_ASSETS) actorAssets.set(name,uiTestAsset(name,'characters')); for (const name of ['icon_cf_quest_offer', 'icon_cf_quest_complete']) actorAssets.set(name, uiTestAsset(name, 'ui')); for (const kind of UI_LAB_ITEM_KINDS) { const name = itemDefinition(kind)?.iconKey; if (name) actorAssets.set(name, uiTestAsset(name, name.startsWith('item_') || name.startsWith('prop_') ? 'props' : 'ui')); } });
function mocks(activate: (id: string) => void) {
  const actor = actorAssets.values().next().value!;
  return { art, activate, assets: actorAssets, actors: [{ id: actor.name, asset: actor.name, label: 'Desert Person 1', kind: 'npc' as const,
    animations: Object.keys(actor.metadata.animations), companions: [] }] };
}
afterAll(() => vi.unstubAllGlobals());
const hashPath = new URL('./snapshot-hashes.json', import.meta.url);
const hashes: Record<string, string> = JSON.parse(readFileSync(hashPath, 'utf8')) as Record<string, string>;
const actual: Record<string, string> = {};
afterAll(() => { if (process.env['UPDATE_UI_SNAPSHOTS'] === '1') writeFileSync(hashPath, `${JSON.stringify(actual, null, 2)}\n`); });
describe('registered lab specimens', () => {
  for (const specimen of UI_LAB_SPECIMENS) for (const [variant, props] of uiLabVariants(specimen).entries()) {
    const name = `${specimen.id}/${variant}`;
    it(`${name} paints real art with stable pixels and clips at nine viewport/scale combinations`, () => {
      for (const scale of [1, 2, 3] as const) for (const width of [320, 640, 960]) {
        const root = new UiRoot({ scale, art }); root.resize(width, 480);
        root.mount(specimen.build(ui, props, mocks(() => {})));
        const recorder = createUiRecordingCanvas(width, 480); root.draw(recorder.context, 0);
        expect(recorder.records.length).toBeGreaterThan(0); expect(recorder.balanced).toBe(true);
        for (const { rect, clip } of recorder.records) {
          expect(rect.x).toBeGreaterThanOrEqual(clip.x); expect(rect.y).toBeGreaterThanOrEqual(clip.y);
          expect(rect.x + rect.width).toBeLessThanOrEqual(clip.x + clip.width);
          expect(rect.y + rect.height).toBeLessThanOrEqual(clip.y + clip.height);
        }
        root.dispose();
      }
      const root = new UiRoot({ scale: 1, art }); root.resize(640, 480);
      root.mount(specimen.build(ui, props, mocks(() => {})));
      const canvas = createCanvas(640, 480); root.draw(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, 0);
      const hash = createHash('sha256').update(canvas.getContext('2d').getImageData(0, 0, 640, 480).data).digest('hex');
      actual[name] = hash;
      if (process.env['UPDATE_UI_SNAPSHOTS'] !== '1') expect(hash).toBe(hashes[name]);
      root.dispose();
    });
    it(`${name} exposes its actions to keyboard focus`, () => {
      const activate = vi.fn(), root = new UiRoot({ scale: 1 }); root.resize(640, 480);
      root.mount(specimen.build(ui, props, mocks(activate))); root.arrange();
      if (specimen.id === 'migration-chat' && props['mode'] === 'commands') {
        const input = root.entries().find(entry => entry.element.id === 'chat.input')!.element;
        const editor = input.props['editor'] as CanvasTextEditor;
        root.focus.set(input); const before = editor.snapshot().value;
        root.key({ key: 'Tab' });
        expect(editor.snapshot().value).not.toBe(before);
        expect(root.focus.current).toBe(input);
        // Tab completes slash commands; ordinary text restores normal focus traversal.
        editor.setValue('Hello orchard'); root.input.text(''); root.arrange();
      }
      const candidates = () => {
        root.arrange(); const modal = uiTopModal(root.entries());
        return root.entries().filter(({ element }) => element.focusable && uiElementEnabled(element) && (!modal || element.isDescendantOf(modal)))
          .toSorted((a, b) => a.order - b.order).map(({ element }) => element);
      };
      const controls = candidates();
      if (specimen.id === 'migration-gateway' && ['busy', 'loading', 'connection-error'].includes(String(props['mode']))
        || specimen.id === 'migration-character-name' && props['mode'] === 'saving') {
        expect(controls).toHaveLength(0);
        for (const key of ['Tab', 'Enter', 'Escape']) root.key({ key });
        expect(root.focus.current).toBeNull();
        expect(activate).not.toHaveBeenCalled();
        root.dispose(); return;
      }
      expect(controls.length).toBeGreaterThan(0);
      for (let i = 0; i < controls.length; i++) {
        const current = candidates(), index = current.indexOf(root.focus.current!);
        root.key({ key: 'Tab' }); expect(root.focus.current).toBe(current[(index + 1) % current.length]);
      }
      for (const control of controls.toReversed()) {
        root.arrange(); if (root.focus.set(control) || root.focus.current === control) root.key({ key: 'Enter' });
      }
      expect(activate).toHaveBeenCalled(); root.key({ key: 'Escape' }); root.dispose();
    });
  }
});
