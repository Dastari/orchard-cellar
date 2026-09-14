import { URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';

const kit = new URL('../../ui/src/kit/index.ts', import.meta.url);
const shell = new URL('../src/shell/app.ts', import.meta.url);
if (!existsSync(kit) || !readFileSync(shell, 'utf8').includes('ui.workbench(')) {
  console.error('Studio build stopped: this checkout still contains the retired UI renderer.');
  console.error('Integrate the reviewed UI kit source before rebuilding Studio.');
  console.error('Current release source: /home/toby/projects/orchard-cellar-studio-release');
  console.error('Release handoff: .git/cellar-ui-release.md (repository root).');
  process.exitCode = 1;
}
