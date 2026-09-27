import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, expect, it, vi } from 'vitest';
import { GameFeedback } from '@orchard/ui/game';
import { uiTestArt } from '../../ui/src/kit/lab/testing/art.js';
import { uiTextLines } from '../../ui/src/kit/components/text.js';
import { ANVIL_FAILURES, failureToastText, KNOWN_FAILURES, RECIPE_PLACE_FAILURES } from './failure-wording.js';

afterEach(() => { vi.unstubAllGlobals(); });

it('words a recipe placement that cannot clear the grid', () => {
  const text = failureToastText(new Error('container_full'), RECIPE_PLACE_FAILURES);
  expect(text).toBe('NO ROOM TO CLEAR THE CRAFTING GRID');
  // Everywhere else a full container keeps the general wording.
  expect(failureToastText(new Error('container_full'))).toBe('NOT ENOUGH INVENTORY SPACE');
});

it('words a crafting mismatch without claiming the grid holds stray items', () => {
  const text = failureToastText(new Error('recipe_inputs_missing'));
  expect(text).toBe("THE GRID DOESN'T MATCH THE RECIPE");
});

it('keeps the anvil-specific wrong-tool wording only at the anvil', () => {
  expect(failureToastText(new Error('wrong_tool'), ANVIL_FAILURES)).toBe('SELECT A DAMAGED TOOL');
  expect(failureToastText(new Error('wrong_tool'))).toBe('THAT NEEDS A DIFFERENT TOOL');
});

it('words a slot refusal', () => {
  // Furnace slots refuse with slot_rejects_item like every other slot; nothing emits a furnace-specific code.
  const text = failureToastText(new Error('slot_rejects_item'));
  expect(text).toBe("THAT ITEM DOESN'T GO IN THAT SLOT");
});

// BUG-043: the client cut every toast to 42 characters ("... REQUIRED FOR"). The HUD toast now shows the whole
// message, wrapping by words onto a second line; this reads back the lines it paints for every wording.
it('shows every failure wording whole in the HUD toast, on at most two lines and never cut mid-word', async () => {
  vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
  const art = await uiTestArt();
  const wordings = [...new Set([...KNOWN_FAILURES, ...RECIPE_PLACE_FAILURES, ...ANVIL_FAILURES].map(([, text]) => text))];
  expect(wordings.some(text => text.length > 42)).toBe(true);
  // A small phone, a phone and the desktop review viewport (logical HUD pixels).
  for (const [width, height] of [[320, 568], [390, 797], [960, 540]] as const) {
    const host = new GameFeedback(art, { onOpenSkillNotice: () => {}, onDismissSkillNotice: () => {} });
    host.setBounds({ worldWidth: width, worldHeight: height, hudWidth: width, hudHeight: height });
    for (const text of wordings) {
      host.update({ sessionKey: 'bug-043', world: { nameplates: [], feedback: [], speech: [], hint: null, fishing: null },
        hud: { prompt: null, tooltip: null, notice: null, toast: { text, tone: 'danger', anchor: { x: width / 2, y: height - 60 } } } });
      const node = host.roots.hud.entries().find(row => row.element.id === 'game.feedback.toast.text')!.element;
      const lines = uiTextLines(String(node.props['text']), node.rect.width, 'body', true, 2, true);
      expect(lines.length, `${width}: ${text}`).toBeLessThanOrEqual(2);
      // Joining the painted lines with single spaces gives the wording back only if every break fell between words.
      expect(lines.join(' '), `${width}: ${text}`).toBe(text);
      // The frame holds every painted line (a wrapped second line must not be clipped).
      expect(node.rect.height, `${width}: ${text}`).toBe(lines.length * 10);
    }
    host.dispose();
  }
});

it('hands the HUD the whole toast message, with no fixed character cut', () => {
  const overworld = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
  expect(overworld).toContain('toast: toastTicks > 0 ? toast : null,');
  expect(overworld).not.toMatch(/\btoast\.(?:slice|substring|substr)\(/u);
});
