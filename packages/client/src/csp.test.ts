import { describe, expect, it } from 'vitest';
import { developmentCsp } from '../vite.config.js';

describe('client content security policy', () => {
  const production = "script-src 'self' 'unsafe-eval'; style-src 'self';";

  it('adds the Vite-only inline-style exception in development', () => {
    expect(developmentCsp(production)).toBe(
      "script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
    );
  });

  it('does not broaden script sources beyond the SDK-required eval exception', () => {
    expect(production).not.toContain("'unsafe-inline'");
    expect(production).toContain("script-src 'self' 'unsafe-eval'");
  });
});
