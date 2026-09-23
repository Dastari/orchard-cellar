import type { TimingProjection } from '@orchard/sim';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiMeter } from './meter.js';
import type { UiStyle } from '../layout/box.js';
import { timingLabels, type TimingLabels } from './timing-canvas.js';
export * from './timing-canvas.js';

/** Retained kit component for authored screens and future frame-design tooling. */
export function uiTiming(options: { readonly timing: TimingProjection; readonly layout?: UiStyle }) {
  const status = uiText('', { wrap: true });
  const time = uiText('', { wrap: true });
  const meter = uiMeter({ label: 'Progress', value: 0 });
  const element = uiFlex({ gap: 4, width: 'grow', ...options.layout }, [status, time, meter]);
  let previous: TimingLabels | undefined;
  const updateTiming = (timing: TimingProjection) => {
    const next = timingLabels(timing);
    if (previous !== next) { status.setProps({ text: next.status }); time.setProps({ text: next.time }); previous = next; }
    if (meter.props['value'] !== timing.progress) meter.setProps({ value: timing.progress }, false);
  };
  updateTiming(options.timing);
  return Object.assign(element, { updateTiming });
}
