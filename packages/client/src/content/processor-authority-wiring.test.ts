import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../overworld-main.ts', import.meta.url), 'utf8');

function bodyBetween(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('client processor content authority wiring', () => {
  it('delegates live processor selection to the shared active resolver', () => {
    const body = bodyBetween(
      'function clientProcessorRuntime(',
      'function processorInterfaceForAdapter(',
    );

    expect(body).toContain('cachedProcessorRuntime(snapshot.content.registry, placeable)');
    expect(body).not.toContain('.objects.get(');
    expect(body).not.toContain('.processes.values(');
  });
});
