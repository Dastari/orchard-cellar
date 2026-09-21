import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { kitLabCodeCards } from './kit-lab-code-cards.js';
it('keeps every lab code card identical to its authored build body', async () => {
  const source = readFileSync(new URL('../../ui/src/kit/lab/source-cards.generated.ts', import.meta.url), 'utf8');
  const serialized = source.slice(source.indexOf('= ') + 2).replace(/;\s*$/u, '');
  expect(JSON.parse(serialized)).toEqual(await kitLabCodeCards());
});
