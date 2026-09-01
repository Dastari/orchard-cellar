import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function reducerSource(name: string, nextName?: string): string {
  const start = source.indexOf(`export const ${name} =`);
  const end = nextName === undefined
    ? source.length
    : source.indexOf(`export const ${nextName} =`, start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  if (nextName !== undefined) expect(end, nextName).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('scheduled reducer authority', () => {
  it.each([
    ['decayEmptyTopsideSoil', 'useFarmTool'],
    ['stepWorld', undefined],
  ] as const)('%s rejects direct client invocation before database work', (name, nextName) => {
    const reducer = reducerSource(name, nextName);
    const guard = "if (!ctx.sender.isEqual(ctx.databaseIdentity)) throw new SenderError('scheduled_reducer_only');";
    expect(reducer).toContain(guard);
    expect(reducer.indexOf(guard)).toBeLessThan(reducer.indexOf('ctx.db.'));
  });
});
