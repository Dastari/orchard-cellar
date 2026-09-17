import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('swing key cellar excavation', () => {
  it('routes the swing key through the intent that keeps cellar digging reachable', () => {
    const handler = source.slice(
      source.indexOf("if (event.code === 'KeyF' && !event.repeat) {"),
      source.indexOf("if (event.code === 'KeyR' && !event.repeat) {"),
    );
    expect(handler).not.toHaveLength(0);
    expect(handler).toContain('swingKeyIntent({');
    const dig = handler.indexOf("swingIntent === 'dig_cellar'");
    const swing = handler.indexOf("swingIntent === 'swing'");
    expect(dig).toBeGreaterThan(-1);
    // A swing cannot excavate terrain, so the wall strike must be tested first.
    expect(dig).toBeLessThan(swing);
    // The unconditional swing return this replaced made every explicit branch
    // below it — cellar walls included — unreachable for any tool with a swing.
    expect(handler).not.toContain("?.swing !== undefined) {\n      performToolAction");
  });
});
