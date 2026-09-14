import { describe, expect, it } from 'vitest';
import { overworldUiLayout } from './overworld-ui.js';

describe('Video controls leave room for the fallback footer', () => {
  for (const [width, height] of [[360, 180], [480, 270], [640, 360], [240, 140]]) {
    it(`keeps actionable rows above the footer at ${width}×${height}`, () => {
      const layout = overworldUiLayout(width!, height!);
      const controls = [layout.lightingQualityButton, layout.worldScaleButton, layout.presentationCapButton];
      const footerTop = layout.settingsContent.y + layout.settingsContent.height - 17;
      for (const control of controls) {
        expect(control.y).toBeGreaterThanOrEqual(layout.settingsContent.y + 23);
        expect(control.y + control.height).toBeLessThanOrEqual(footerTop);
      }
      expect(controls[0]!.y + controls[0]!.height).toBeLessThanOrEqual(controls[1]!.y);
      expect(controls[1]!.y + controls[1]!.height).toBeLessThanOrEqual(controls[2]!.y);
    });
  }
});
