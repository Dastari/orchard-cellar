import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('optimistic item action readiness', () => {
  it('ignores distant pointer and keyboard tile-tool input before target feedback or optimistic costs', () => {
    const pointer = source.slice(source.indexOf('const farmItem = selectedItem(latestSnapshot)'), source.indexOf("canvas.addEventListener('pointerup'"));
    const pointerPreflight = pointer.indexOf('ignoreDistantTileToolInput(latestSnapshot)');
    expect(pointerPreflight).toBeGreaterThanOrEqual(0);
    expect(pointerPreflight).toBeLessThan(pointer.indexOf('performFarmToolAction('));
    expect(pointerPreflight).toBeLessThan(pointer.indexOf('targetFishingTile()'));
    expect(pointerPreflight).toBeLessThan(pointer.indexOf("setToast('TARGET A CLEAR WATER TILE'"));
    const keyboard = source.slice(source.indexOf("if (event.code === 'KeyF'"), source.indexOf("if (event.code === 'Space'"));
    const fishing = keyboard.slice(keyboard.indexOf('if (fishingToolAction !== null)'));
    expect(fishing.indexOf('ignoreDistantTileToolInput(snapshot)')).toBeGreaterThanOrEqual(0);
    expect(fishing.indexOf('ignoreDistantTileToolInput(snapshot)')).toBeLessThan(fishing.indexOf('targetFishingTile()'));
    const farm = source.slice(source.indexOf('function performFarmToolAction('), source.indexOf('function isVitalsTool('));
    expect(farm.indexOf('tileToolInputOutOfReach(')).toBeGreaterThanOrEqual(0);
    expect(farm.indexOf('tileToolInputOutOfReach(')).toBeLessThan(farm.indexOf('performToolAction('));
  });

  it('gates SPACE requests on learned skills instead of generating an expected failure toast', () => {
    const jump = source.slice(source.indexOf("if (event.code === 'Space'"), source.indexOf("if (event.code === 'KeyE'"));
    expect(jump).toContain('if (jumpInputSkillAvailable(latestSnapshot.skillNodes, mount, mountedNpc !== null))');
    expect(jump.indexOf('jumpInputSkillAvailable(')).toBeLessThan(jump.indexOf('network.jumpHorse()'));
  });

  it('checks readiness before ordinary tool animation and sound', () => {
    const action = source.slice(
      source.indexOf('function performToolAction'),
      source.indexOf('interface FarmToolTarget'),
    );
    expect(action.indexOf('itemActionRejection(')).toBeGreaterThanOrEqual(0);
    expect(action.indexOf('itemActionRejection(')).toBeLessThan(action.indexOf('startPredictedAction('));
    expect(action.indexOf('itemActionRejection(')).toBeLessThan(action.indexOf("audio.playSfx('tool_swing')"));
  });

  it('checks bow readiness both before drawing and again before release', () => {
    const release = source.slice(
      source.indexOf('function releaseBowShot'),
      source.indexOf('function setInterfaceHidden'),
    );
    expect(release.indexOf('itemActionRejection(')).toBeGreaterThanOrEqual(0);
    expect(release.indexOf('itemActionRejection(')).toBeLessThan(release.indexOf("startPredictedAction('ranged_weapon'"));

    const pointerDraw = source.slice(
      source.indexOf("if (event.button === 0 && selectedAimedUseAction(latestSnapshot) !== null"),
      source.indexOf('const farmItem = selectedItem(latestSnapshot)'),
    );
    expect(pointerDraw.indexOf('itemActionRejection(')).toBeGreaterThanOrEqual(0);
    expect(pointerDraw.indexOf('itemActionRejection(')).toBeLessThan(pointerDraw.indexOf('bowChargeStartedAtMs = performance.now()'));
    expect(pointerDraw.indexOf('itemActionRejection(')).toBeLessThan(pointerDraw.indexOf("startPredictedAction('ranged_weapon'"));
  });
});
