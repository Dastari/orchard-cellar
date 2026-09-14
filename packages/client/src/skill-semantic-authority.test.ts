import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('authored skill semantic presentation', () => {
  it('uses one active-registry capability projection for minimap and mining presentation', () => {
    expect(source).toContain('const skillCapabilities = runtimeSkillCapabilities(');
    expect(source).toContain('minimapTrackingEnabled: skillCapabilities.minimapPlayerTracking');
    expect(source).toContain('const efficientRank = skillCapabilities.efficientStrikesRank');
    expect(source).toContain('const prospectorRank = skillCapabilities.miningYieldInspection ? 1 : 0');
    expect(source).toContain('const oreDressingRank = skillCapabilities.oreDressingRank');
    expect(source).toContain('const rockhoundRank = skillCapabilities.rockhoundRank');
  });

  it('does not inspect bootstrap skill-node IDs on the live presentation path', () => {
    for (const id of ['cartographer', 'efficient_strikes', 'prospector', 'ore_dressing', 'rockhound']) {
      expect(source).not.toContain(`nodeId === '${id}'`);
    }
  });
});
