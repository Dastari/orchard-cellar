import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
it('keeps generated content schemas synchronized with definition types', () => {
  expect(() => execFileSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/generate-content-field-schemas.ts', '--check'], { cwd: process.cwd(), stdio: 'pipe' })).not.toThrow();
});
