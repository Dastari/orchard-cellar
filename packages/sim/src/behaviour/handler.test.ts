import { describe, expect, expectTypeOf, it } from 'vitest';
import type { UseEvent } from './events.js';
import {
  MAX_EFFECTS_PER_HANDLER_RESULT,
  blockedResult,
  effectsResult,
  handlerResultWithinEffectCap,
  interactionSupportedByEngine,
  isBlockedHandlerResult,
  type Handler,
  type InteractionDefinition,
} from './handler.js';

describe('behaviour handler contract', () => {
  it('constructs and narrows effect and blocked results', () => {
    const success = effectsResult([{ toggleState: 'lit' }], { continue: true });
    const blocked = blockedResult('item_out_of_reach');

    expect(success).toEqual({ effects: [{ toggleState: 'lit' }], continue: true });
    expect(isBlockedHandlerResult(success)).toBe(false);
    expect(isBlockedHandlerResult(blocked)).toBe(true);
    expect(blocked).toEqual({ blocked: 'item_out_of_reach' });
  });

  it('types compiled handlers to a specific event while sharing the snapshot contract', () => {
    const handler: Handler<UseEvent> = (event, view) => (
      view.target !== undefined && 'entityType' in view.target && event.target.id === view.target.id
        ? effectsResult([{ openFrame: 'frame:chest' }])
        : blockedResult('target_snapshot_mismatch')
    );
    expectTypeOf(handler).toMatchTypeOf<Handler<UseEvent>>();
  });

  it('applies the common bounded-effect contract', () => {
    const maximum = Array.from(
      { length: MAX_EFFECTS_PER_HANDLER_RESULT },
      () => ({ sfx: 'tick' } as const),
    );
    expect(handlerResultWithinEffectCap(effectsResult(maximum))).toBe(true);
    expect(handlerResultWithinEffectCap(effectsResult([...maximum, { sfx: 'overflow' }]))).toBe(false);
    expect(handlerResultWithinEffectCap(blockedResult('blocked'))).toBe(true);
  });

  it('checks an interaction against condition and effect engine tags', () => {
    const interaction = {
      id: 'toggle',
      verb: 'use',
      prompt: { lit: 'PUT OUT', default: 'LIGHT' },
      conditions: [{ reach: 'object' }],
      effects: [
        { toggleState: 'lit' },
        { sfx: 'lantern_click' },
        { statistic: 'lights_toggled' },
      ],
      priority: 10,
    } as const satisfies InteractionDefinition;

    expect(interactionSupportedByEngine(interaction, 1)).toBe(true);
    expect(interactionSupportedByEngine(interaction, 0)).toBe(false);
  });
});
