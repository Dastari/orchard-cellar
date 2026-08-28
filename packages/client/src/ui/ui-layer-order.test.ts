import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../overworld-main.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./overworld-ui.ts', import.meta.url), 'utf8');

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

  it('uses the authored ribbon for the online-player heading', () => {
    const start = ui.indexOf('drawOnlinePlayers(');
    const end = ui.indexOf('private drawStatus(', start);
    const roster = ui.slice(start, end);
    expect(roster).toContain('this.windowRibbon.draw(');
    expect(roster).toContain('`ONLINE PLAYERS  ${players.length}`');
  });
});
