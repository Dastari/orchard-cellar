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
