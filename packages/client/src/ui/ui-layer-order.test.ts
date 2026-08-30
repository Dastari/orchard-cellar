import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../overworld-main.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./overworld-ui.ts', import.meta.url), 'utf8');
const trade = readFileSync(new URL('./trade-ui.ts', import.meta.url), 'utf8');
const npc = readFileSync(new URL('./npc-interaction-ui.ts', import.meta.url), 'utf8');
const characterName = readFileSync(new URL('./character-name-prompt.ts', import.meta.url), 'utf8');

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
    expect(pointerMove.indexOf('overworldUi.systemCursorMove')).toBeLessThan(pointerMove.indexOf('tradeUi.pointerMove'));
    expect(pointerMove.indexOf('overworldUi.systemCursorMove')).toBeLessThan(pointerMove.indexOf('npcInteractionUi.pointerMove'));

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
