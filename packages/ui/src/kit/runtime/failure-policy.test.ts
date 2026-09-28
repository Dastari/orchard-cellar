import { afterEach, expect, it, vi } from 'vitest';
import { reportUiFailure, setUiFailureReporter, UI_FAILURE_LOG_LIMIT, UiFailureLog, uiFailurePolicy } from './failure-policy.js';

afterEach(() => { setUiFailureReporter(null); vi.restoreAllMocks(); });

it('keeps UI failures hard under test and development (BUG-066)', () => {
  expect(uiFailurePolicy()).toBe('throw');
});

it('reports each contained failure once and stops remembering new ones at its limit', () => {
  const log = new UiFailureLog();
  expect(log.first('statistics', new Error('Duplicate UI id: a'))).toBe(true);
  expect(log.first('statistics', new Error('Duplicate UI id: a'))).toBe(false);
  for (let index = 1; index < UI_FAILURE_LOG_LIMIT; index++) expect(log.first('statistics', new Error(`changing ${index}`))).toBe(true);
  // Messages that keep changing can't grow the log without bound.
  expect(log.first('statistics', new Error('one more'))).toBe(false);
});

it('sends contained failures to the host telemetry, which can never take the UI down', () => {
  const console = vi.spyOn(globalThis.console, 'error').mockImplementation(() => {});
  const reporter = vi.fn(), error = new Error('Duplicate UI id: statistics.record:connections_opened:');
  setUiFailureReporter(reporter);
  reportUiFailure('character', error);
  expect(reporter).toHaveBeenCalledExactlyOnceWith('character', error);
  expect(console).toHaveBeenCalledOnce();
  setUiFailureReporter(() => { throw new Error('telemetry offline'); });
  expect(() => reportUiFailure('character', error)).not.toThrow();
});
