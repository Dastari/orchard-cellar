import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../ui/src/overworld-ui.ts', import.meta.url), 'utf8');
const trade = readFileSync(new URL('../../ui/src/trade-ui.ts', import.meta.url), 'utf8');
const npc = readFileSync(new URL('../../ui/src/npc-interaction-ui.ts', import.meta.url), 'utf8');
const characterName = readFileSync(new URL('../../ui/src/character-name-prompt.ts', import.meta.url), 'utf8');

describe('overworld UI compositing order', () => {
  it('draws the system cursor after every other scene overlay', () => {
    const frameStart = main.indexOf('questTracker.draw(uiContext)');
    const frameEnd = main.indexOf("if (!interfaceHidden && debugCollision", frameStart);
    const composite = main.slice(frameStart, frameEnd);
    const cursor = composite.indexOf('overworldUi.drawCursorOverlay(uiContext)');
    expect(cursor).toBeGreaterThan(composite.indexOf('overworldUi.drawOnlinePlayers'));
    expect(cursor).toBeGreaterThan(composite.indexOf('npcInteractionUi.draw'));
    expect(cursor).toBeGreaterThan(composite.indexOf('tradeUi.draw'));
    expect(cursor).toBeGreaterThan(composite.indexOf('characterNamePrompt.draw'));
    expect(cursor).toBeGreaterThan(composite.indexOf('touchControls.draw'));
  });

  it('keeps the build toggle above joystick input and the open build catalogue', () => {
    const start = main.indexOf("canvas.addEventListener('pointerdown'");
    const end = main.indexOf("canvas.addEventListener('pointerup'", start);
    const input = main.slice(start, end);
    const build = input.indexOf('overworldUi.pointerBuildControl');
    expect(build).toBeGreaterThan(input.indexOf('overworldUi.blockingUpdatePromptVisible'));
    const trade = input.indexOf("retainedPointers.dispatch('down', event, 'player-trade')");
    const palette = input.indexOf("retainedPointers.dispatch('down', event, 'build-palette')");
    expect(trade).toBeGreaterThan(0); expect(palette).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(trade);
    expect(build).toBeLessThan(input.indexOf('touchControls.pointerDown'));
    expect(build).toBeLessThan(palette);
    const frame = main.slice(main.indexOf('questTracker.draw(uiContext)'));
    expect(frame.indexOf('overworldUi.drawBuildControl')).toBeGreaterThan(frame.indexOf('touchControls.draw'));
    expect(frame.indexOf('overworldUi.drawBuildControl')).toBeGreaterThan(frame.indexOf('homesteadBuildPalette.draw'));
  });

  it('keeps one cursor renderer while modals retain only their hover state', () => {
    expect(trade).not.toContain('this.skin.cursor');
    expect(npc).not.toContain('this.skin.cursor');
    expect(characterName).not.toContain('this.skin.cursor');
    expect(ui.match(/drawUiSkinNatural\(context, this\.skin\.cursor,/g)).toHaveLength(1);
    const overlayStart = ui.indexOf('drawCursorOverlay(');
    const overlayEnd = ui.indexOf('systemCursorMove(', overlayStart);
    const overlay = ui.slice(overlayStart, overlayEnd);
    expect(overlay.indexOf('drawDraggedItem')).toBeLessThan(overlay.indexOf('this.drawCursor(context)'));
  });

  it('updates the system cursor before modal routing and clears it when the window blurs', () => {
    const pointerMoveStart = main.indexOf("canvas.addEventListener('pointermove'");
    const pointerMoveEnd = main.indexOf("canvas.addEventListener('pointerleave'", pointerMoveStart);
    const pointerMove = main.slice(pointerMoveStart, pointerMoveEnd);
    expect(pointerMove.indexOf("retainedPointers.dispatch('move', event, 'player-trade')")).toBeGreaterThan(0);
    expect(pointerMove.indexOf('overworldUi.systemCursorMove')).toBeLessThan(pointerMove.indexOf("retainedPointers.dispatch('move', event, 'player-trade')"));
    expect(pointerMove.indexOf('overworldUi.systemCursorMove')).toBeLessThan(pointerMove.indexOf("retainedPointers.dispatch('move', event, 'npc-interaction')"));

    const blurStart = main.indexOf("window.addEventListener('blur'");
    const blurEnd = main.indexOf('function dispatchTouchControlAction', blurStart);
    expect(main.slice(blurStart, blurEnd)).toContain('clearPointerPresentation()');
  });

  it('uses the authored ribbon for the online-player heading', () => {
    const start = ui.indexOf('drawOnlinePlayers(');
    const end = ui.indexOf('private drawStatus(', start);
    const roster = ui.slice(start, end);
    expect(roster).toContain('this.windowRibbon.draw(');
    expect(roster).toContain('`ONLINE PLAYERS  ${players.length}`');
  });
});

it('routes adopted modal roots through every central uncaptured input entry', () => {
  for (const host of ['character-character', 'character-statistics', 'character-skills', 'npc-interaction']) {
    expect(main).toContain(`retainedUi.key(event, '${host}')`);
    expect(main).toContain(`retainedPointers.dispatch('move', event, '${host}')`);
    expect(main).toContain(`retainedPointers.dispatch('down', event, '${host}')`);
    expect(main).toMatch(new RegExp(`retainedUi\\.wheel\\([\\s\\S]*?, '${host}'\\)`));
  }
});
