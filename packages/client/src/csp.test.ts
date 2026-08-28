import { describe, expect, it } from 'vitest';
import { developmentCsp } from '../vite.config.js';

describe('client content security policy', () => {
  const production = "worker-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self';";

  it('adds the Vite-only style and reconnect-worker exceptions in development', () => {
    expect(developmentCsp(production)).toBe(
      "worker-src 'self' blob:; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
    );
  });

  it('adds an explicit development worker policy when the document relies on default-src', () => {
    const editorPolicy = "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self';";
    expect(developmentCsp(editorPolicy)).toBe(
      "default-src 'self'; worker-src 'self' blob:; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
    );
  });

  it('does not broaden script sources beyond the SDK-required eval exception', () => {
    expect(production).not.toContain("'unsafe-inline'");
    expect(production).not.toContain('blob:');
    expect(production).toContain("script-src 'self' 'unsafe-eval'");
  });
});
