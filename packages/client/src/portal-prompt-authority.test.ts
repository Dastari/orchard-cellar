import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('authored portal prompt wiring', () => {
  it('does not restore exact Marlow portal-kind branches', () => {
    expect(main).not.toContain('marlow_tent_enter');
    expect(main).not.toContain('marlow_tent_exit');
    expect(main).not.toContain("ENTER MARLOW\\'S TENT");
    expect(main).not.toContain("LEAVE MARLOW\\'S TENT");
  });

  it('resolves static portal language from the active registry', () => {
    expect(main).toContain('authoredSpacePortalPrompt(snapshot.content.registry, portal)');
    expect(main).toContain('if (authoredPortal.authored && authoredPortal.prompt === null) return false;');
    expect(main).toContain('authoredSpacePortalPrompt(snapshot.content.registry, target.portal).prompt');
    expect(main).toContain('if (authoredPrompt !== null) return `[E] ${authoredPrompt}`;');
  });
});
