import type { UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiScrollArea } from './layout.js';
import { uiText } from './text.js';

export interface UiDiagnosticsOptions {
  readonly id?: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly layout?: UiStyle;
}

/** Retained diagnostic output. Wrapping and scrolling keep every line reachable
 * at small viewport sizes without painting beyond the frame. */
export function uiDiagnostics(options: UiDiagnosticsOptions) {
  const id = options.id ?? 'diagnostics';
  let value = options.lines.join('\n');
  const text = uiText(value, { id: `${id}.text`, wrap: true, layout: { width: 'grow' } });
  const scrollArea = uiScrollArea({ id: `${id}.scroll`, label: options.title, padding: { right: 8 } }, [text]);
  scrollArea.focusable = true;
  const frame = uiFrame({ id, blockInput: true, tone: 'neutral', style: 'thin',
    header: { title: options.title }, layout: { width: 'grow', height: 'grow', ...options.layout }, children: [scrollArea] });
  return Object.assign(frame, { scrollArea, updateLines(lines: readonly string[]) {
    const next = lines.join('\n');
    if (next === value) return;
    value = next;
    text.setProps({ text: value });
    text.label = value;
  } });
}
