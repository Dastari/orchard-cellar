import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('optimistic item action readiness', () => {
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
      source.indexOf("if (event.button === 0 && selectedItem(latestSnapshot) === 'bow'"),
      source.indexOf('const farmItem = selectedItem(latestSnapshot)'),
    );
    expect(pointerDraw.indexOf('itemActionRejection(')).toBeGreaterThanOrEqual(0);
    expect(pointerDraw.indexOf('itemActionRejection(')).toBeLessThan(pointerDraw.indexOf('bowChargeStartedAtMs = performance.now()'));
    expect(pointerDraw.indexOf('itemActionRejection(')).toBeLessThan(pointerDraw.indexOf("startPredictedAction('ranged_weapon'"));
  });
});
