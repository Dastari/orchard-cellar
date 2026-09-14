import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const world = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('rogue enemy attack-pattern authority', () => {
  it('does not restore exact NPC-kind attack branches', () => {
    expect(world).not.toMatch(/npc\.kind\s*===\s*['"]cowling['"]/u);
    expect(world).not.toMatch(/npc\.kind\s*===\s*['"]flying_skull['"]/u);
    expect(world).not.toMatch(/npc\.kind\.startsWith\(\s*['"]slime_['"]\s*\)/u);
  });

  it('uses the active authored pattern resolver and refuses unresolved attacks', () => {
    expect(world).toContain('runtimeRogueEnemyAttackPattern(contentRegistry(ctx),npc.kind,profile.archetype)');
    expect(world).toContain('if(pattern!==null)');
  });
});
