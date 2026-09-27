import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLOSING_ENTITY_WINDOW_MS, ClosingEntityWindows, entityWindowKey, escapeClosesSurface } from './escape-precedence.js';

describe('BUG-060: Escape closes the topmost open surface before opening the menu', () => {
  const none = { chatOpen: false, buildMode: false, windowOpen: false };
  it('closes an open chat input, then build mode, and otherwise lets the game handle Escape (windows, then the menu)', () => {
    expect(escapeClosesSurface('Escape', false, { ...none, chatOpen: true })).toBe('chat-input');
    expect(escapeClosesSurface('Escape', false, { ...none, chatOpen: true, buildMode: true })).toBe('chat-input');
    expect(escapeClosesSurface('Escape', false, { ...none, buildMode: true })).toBe('build-mode');
    // A window over build mode closes first (the game's own Escape handling).
    expect(escapeClosesSurface('Escape', false, { ...none, buildMode: true, windowOpen: true })).toBeNull();
    expect(escapeClosesSurface('Escape', false, none)).toBeNull();
    expect(escapeClosesSurface('Escape', true, { ...none, buildMode: true })).toBeNull();
    expect(escapeClosesSurface('KeyB', false, { ...none, buildMode: true })).toBeNull();
  });

  it('keeps a just-closed chest or station closed until the server confirms, and never locks it shut', () => {
    const guard = new ClosingEntityWindows();
    expect(guard.suppresses('chest:7')).toBe(false);
    guard.closed('chest:7', 1_000);
    guard.observe('chest:7', 1_050);
    expect(guard.suppresses('chest:7')).toBe(true);
    expect(guard.suppresses('chest:8')).toBe(false);
    // The server applied the close: the guard is spent, and reopening the same chest later works.
    guard.observe(null, 1_100);
    expect(guard.suppresses('chest:7')).toBe(false);
    // A close the server never applies expires.
    guard.closed('placeable:3', 5_000);
    guard.observe('placeable:3', 5_000 + CLOSING_ENTITY_WINDOW_MS - 1); expect(guard.suppresses('placeable:3')).toBe(true);
    guard.observe('placeable:3', 5_000 + CLOSING_ENTITY_WINDOW_MS); expect(guard.suppresses('placeable:3')).toBe(false);
    // Opening a different entity clears it at once.
    guard.closed('chest:1', 9_000); guard.observe('placeable:2', 9_010); expect(guard.suppresses('chest:1')).toBe(false);
  });

  it('records the window on screen, not the newest snapshot\'s entity, when the server switches entities (review finding 1)', () => {
    const guard = new ClosingEntityWindows();
    // Frame 1: the chest window is on screen.
    guard.observe('chest:7', 1_000); guard.showing('chest:7');
    // Frame 2: the server switched the session to a furnace; the sync closes the chest window (closeChest), which
    // records what was on screen, the chest.
    guard.observe('placeable:3', 1_016); guard.closedShown(1_016);
    expect(guard.suppresses('placeable:3')).toBe(false);
    // Nothing on screen: a later close records nothing.
    guard.showing(null); guard.closedShown(1_100); expect(guard.suppresses('placeable:3')).toBe(false);
  });

  it('lets a fresh interact reopen the same chest at once (review finding 2)', () => {
    const guard = new ClosingEntityWindows();
    guard.showing('chest:7'); guard.closedShown(1_000);
    guard.observe('chest:7', 1_010); expect(guard.suppresses('chest:7')).toBe(true);
    guard.interacted();
    expect(guard.suppresses('chest:7')).toBe(false);
  });

  it('keys chests, the hearth stash and placeables apart', () => {
    expect(entityWindowKey({ activeChest: { id: 4n }, activePlaceable: null, hearthStashOpen: false })).toBe('chest:4');
    expect(entityWindowKey({ activeChest: null, activePlaceable: { id: 4n }, hearthStashOpen: false })).toBe('placeable:4');
    expect(entityWindowKey({ activeChest: null, activePlaceable: { id: 4n }, hearthStashOpen: true })).toBe('hearth-stash');
    expect(entityWindowKey({ activeChest: null, activePlaceable: null, hearthStashOpen: false })).toBeNull();
  });

  it('is wired into the client: the keydown chain and the snapshot window sync', () => {
    const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
    const keydown = main.slice(main.indexOf("if (event.code === 'Tab') {\n      setOnlinePlayersVisible(true, true);"), main.indexOf('if (overworldUi.handleKeyDown(event.code'));
    expect(keydown).toContain('escapeClosesSurface(event.code, event.repeat,');
    const sync = main.slice(main.indexOf('const closingEntityKey = entityWindowKey(snapshot)'), main.indexOf('if (optimisticSelectedSlot !== null && snapshot.survival?.selectedSlot'));
    expect(sync).toContain('closingEntityWindows.observe(closingEntityKey');
    expect(sync.match(/!closingEntityWindows\.suppresses\(closingEntityKey\)/gu)?.length).toBeGreaterThanOrEqual(8);
    const callbacks = main.slice(main.indexOf('closeChest: () =>'), main.indexOf('closePlaceable: () =>') + 300);
    expect(callbacks.match(/closingEntityWindows\.closedShown\(/gu)?.length).toBe(2);
    expect(sync).not.toContain('closingEntityWindows.closed(');
    const syncTail = main.slice(main.indexOf('closingEntityWindows.showing('), main.indexOf('closingEntityWindows.showing(') + 200);
    expect(syncTail).toContain('closingEntityKey');
    // Every entity interact resets the guard: chest, placeable and hearth stash.
    const interactStart = main.indexOf("case 'hearth_stash':\n      closingEntityWindows");
    const interact = main.slice(interactStart, main.indexOf("case 'merchant':", interactStart));
    expect(interact.match(/closingEntityWindows\.interacted\(\)/gu)?.length).toBe(3);
  });
});
