import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAP_EDITOR_VALIDATION_DEBOUNCE_MS } from './model.js';

describe('map editor terrain validation performance contract', () => {
  const source = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');

  it('debounces edited terrain and validates it away from the main thread', () => {
    expect(MAP_EDITOR_VALIDATION_DEBOUNCE_MS).toBeGreaterThanOrEqual(100);
    expect(source).toContain('mapEditorValidationWorkerAvailable()');
    expect(source).toContain('loadMapEditorValidation(document)');
    expect(source).toContain('clearTimeout(this.#validationTimer)');
    expect(source).toContain('Map validation is updating…');
  });

  it('retains exact synchronous validation only as the worker-unavailable fallback', () => {
    const fallback = source.slice(source.indexOf("} else if (!mapEditorValidationWorkerAvailable())"),
      source.indexOf("message: 'Map validation is updating…'"));
    expect(fallback).toContain('validateMapDocument(terrainDocumentForMapV3(this.#document))');
  });
});
