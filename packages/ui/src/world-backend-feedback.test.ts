import { afterEach, describe, expect, it } from 'vitest';
import { backendReasonLayout, wrapBackendReason } from './world-backend-feedback.js';
import { overworldUiLayout } from './overworld-ui.js';
import { renderProtocolBounds } from './world-render-controls.js';
import { compactVideoRows, videoRowHeight } from './video-rows.js';
import { updateWorldBackendStatus } from './world-backend-setting.js';
import { measurePixelText, type PixelUi } from './pixel-ui.js';

const fonts = { font: {} } as PixelUi;
const reason = 'webgl_unsupported_canvas_property:strokeStyle';
afterEach(() => updateWorldBackendStatus('canvas2d', null));

describe('complete WebGL fallback feedback', () => {
  it.each([[240, 140], [360, 180], [480, 270], [640, 360]])('fits the property below both panels at %ix%i', (width, height) => {
    updateWorldBackendStatus('canvas2d', reason);
    const layout = overworldUiLayout(width, height);
    for (const panel of ['video', 'render']) {
      const content = panel === 'video' ? layout.settingsContent : layout.developerContent;
      const button = renderProtocolBounds(layout);
      const top = panel === 'video'
        ? content.y + 23 + (compactVideoRows(content.height) ? 3 : 8) * videoRowHeight(content.height) + 3
        : button.y + button.height + 3;
      const bounds = { x: content.x + 10, y: top, width: content.width - 20,
        height: content.y + content.height - 7 - top };
      const result = backendReasonLayout(fonts, reason, bounds);
      expect(result.complete).toBe(true);
      expect(result.lines.join('').replaceAll(' ', '')).toBe('CANVAS:UNSUPPORTEDCANVASPROPERTY:STROKESTYLE');
      expect(result.lines.length * result.lineHeight).toBeLessThanOrEqual(bounds.height);
      for (const line of result.lines) expect(measurePixelText(line, result.scale, fonts.font)).toBeLessThanOrEqual(bounds.width);
    }
  });
  it('wraps long operation identifiers without dropping characters', () => {
    const text = 'WEBGL ERROR: unsupported_operation_with_a_long_identifier';
    expect(wrapBackendReason(text, 10, (line) => line.length).join('').replaceAll(' ', '')).toBe(text.replaceAll(' ', ''));
  });
});
