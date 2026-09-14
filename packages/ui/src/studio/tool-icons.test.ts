import { describe, expect, it } from 'vitest';
import { STUDIO_TOOL_ICON_IDS, STUDIO_TOOL_ICONS, studioToolIcon } from './tool-icons.js';

describe('Studio Teams-style tool rail icons', () => {
  it('owns a generated catalog icon and tooltip label for every main tool', () => {
    expect(Object.keys(STUDIO_TOOL_ICONS).sort()).toEqual([...STUDIO_TOOL_ICON_IDS].sort());
    for (const id of STUDIO_TOOL_ICON_IDS) {
      expect(studioToolIcon(id)).toMatchObject({ label: expect.any(String), frame: expect.any(Number) });
      expect(studioToolIcon(id).label.length).toBeGreaterThan(2);
    }
  });

  it('fails closed for an unreviewed route icon', () => {
    expect(() => studioToolIcon('unreviewed-tool')).toThrow('studio_tool_icon_unknown:unreviewed-tool');
  });
});
