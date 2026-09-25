import { beforeAll, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { uiTestArt } from '../lab/testing/art.js';
import { UiRoot } from '../runtime/root.js';
import type { UiElement } from '../runtime/element.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiWindow } from './window.js';
import { uiChoiceButton, uiDialogueBody } from './social.js';
import { uiDialogue } from './dialogue.js';
import { uiElementUpperCase, type UiKitArt } from './art.js';
import * as pixel from '../../pixel-ui.js';

let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });

/** Every string the pixel font draws while the tree paints. */
function painted(view: UiElement): string[] {
  vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
  const drawn: string[] = [];
  const plain = vi.spyOn(pixel, 'drawPixelText').mockImplementation((_c, _p, text) => { drawn.push(String(text)); });
  const outlined = vi.spyOn(pixel, 'drawOutlinedPixelText').mockImplementation((_c, _p, text) => { drawn.push(String(text)); });
  const root = new UiRoot({ art, scale: 1 }); root.resize(640, 360); root.mount(view); root.arrange();
  root.drawInContext(createCanvas(640, 360).getContext('2d') as unknown as CanvasRenderingContext2D, 0);
  root.dispose(); plain.mockRestore(); outlined.mockRestore();
  return drawn;
}

it('paints labels and buttons in caps inside game windows, keeping accessible labels as authored (owner item 10)', () => {
  const label = uiText('Recipe book'), button = uiButton({ label: 'Place in grid', onPress: () => {} }), choice = uiChoiceButton({ label: 'Sign out', onPress: () => {} });
  const drawn = painted(uiWindow({ id: 'caps', title: 'MENU', children: [label, button, choice] }));
  expect(drawn).toEqual(expect.arrayContaining(['RECIPE BOOK', 'PLACE IN GRID', 'SIGN OUT']));
  expect(drawn).not.toContain('Recipe book');
  expect([label.label, button.label, choice.label]).toEqual(['Recipe book', 'Place in grid', 'Sign out']);
});

it('leaves Studio-style surfaces (no game window) in their authored case', () => {
  const label = uiText('Recipe book');
  expect(painted(uiFlex({}, [label, uiButton({ label: 'Save', onPress: () => {} })]))).toEqual(expect.arrayContaining(['Recipe book', 'Save']));
  expect(uiElementUpperCase(label)).toBe(false);
});

it('keeps dialogue, including the numbered replies, as authored inside a caps window', () => {
  const drawn = painted(uiWindow({ id: 'talk', title: 'MARLOW', children: [uiDialogueBody({ speaker: 'Marlow', body: 'Well met.', portrait: () => {}, onChoose: () => {},
    choices: [{ id: 'shop', label: 'Let me see what you have to offer.' }] })] }));
  expect(drawn).toContain('Let me see what you have to offer.');
  expect(drawn).not.toContain('LET ME SEE WHAT YOU HAVE TO OFFER.');
});

it('lets a paragraph opt out inside a caps window', () => {
  const drawn = painted(uiWindow({ id: 'hint', title: 'CRAFTING', children: [uiText('Choose a recipe to see what it needs.', { textCase: 'as-authored' })] }));
  expect(drawn).toContain('Choose a recipe to see what it needs.');
});

it('keeps the live dialogue window (uiDialogue) as authored: the NPC speech and the numbered replies (PR #189 review B1)', () => {
  const frame = uiDialogue({ model: { id: 'greeting', speaker: 'Marlow', body: 'Well met, traveller.', choices: [{ id: 'shop', label: 'Let me see what you have to offer.' }, { id: 'bye', label: 'Goodbye' }] },
    choose: () => {}, onClose: () => {} });
  const drawn = painted(frame);
  expect(drawn).toEqual(expect.arrayContaining(['Let me see what you have to offer.', 'Goodbye']));
  expect(drawn).not.toContain('LET ME SEE WHAT YOU HAVE TO OFFER.');
  expect(drawn).not.toContain('GOODBYE');
  expect(drawn.join(' ')).toContain('Well');
  expect(drawn.join(' ')).not.toContain('WELL');
  // The ribbon still names the speaker in caps.
  expect(drawn).toContain('MARLOW');
});

it('keeps wrapped paragraphs as authored inside a caps window, while short labels and explicit upper stay in caps (PR #189 review B2)', () => {
  const drawn = painted(uiWindow({ id: 'para', title: 'UPDATE READY', children: [
    uiText('A new version is ready. Reload to update.', { wrap: true }),
    uiText('Click an item to offer it.', { overflow: 'wrap' }),
    uiText('Rooms'),
    uiText('Wrapped heading', { wrap: true, textCase: 'upper' }),
    uiButton({ label: 'Reload', onPress: () => {} }),
  ] }));
  expect(drawn).toEqual(expect.arrayContaining(['A new version is ready. Reload to update.', 'Click an item to offer it.', 'ROOMS', 'WRAPPED HEADING', 'RELOAD']));
  expect(drawn).not.toContain('A NEW VERSION IS READY. RELOAD TO UPDATE.');
});

it('repaints the new text after a caps label changes (the caps string is cached per source)', () => {
  vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
  const label = uiText('Idle'), root = new UiRoot({ art, scale: 1 }), context = createCanvas(640, 360).getContext('2d') as unknown as CanvasRenderingContext2D;
  root.resize(640, 360); root.mount(uiWindow({ id: 'swap', title: 'PRESS', children: [label] })); root.arrange();
  const drawn: string[] = [];
  const plain = vi.spyOn(pixel, 'drawPixelText').mockImplementation((_c, _p, text) => { drawn.push(String(text)); });
  root.drawInContext(context, 0);
  expect(drawn).toContain('IDLE');
  drawn.length = 0; label.setProps({ text: 'Pressing' }); root.arrange(); root.drawInContext(context, 0);
  expect(drawn).toContain('PRESSING');
  expect(drawn).not.toContain('IDLE');
  root.dispose(); plain.mockRestore();
});
