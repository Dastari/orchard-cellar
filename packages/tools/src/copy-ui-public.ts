import { fileURLToPath } from 'node:url';
import { cp, mkdir } from 'node:fs/promises';
import { workspaceRoot } from './assets/load.js';

type Frontend = 'client' | 'studio';

/** Build copies preserve /ui/lucide URLs; only this package owns the source. */
export async function copyUiPublic(
  apps: readonly Frontend[] = ['client', 'studio'],
  root = workspaceRoot,
): Promise<void> {
  for (const app of apps) {
    const target = new URL(`packages/${app}/public/ui/lucide/`, root);
    await mkdir(target, { recursive: true });
    await cp(new URL('packages/ui/public/ui/lucide/', root), target, { recursive: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = process.argv[2];
  if (app !== undefined && app !== 'client' && app !== 'studio') throw new Error('Unknown frontend');
  await copyUiPublic(app === undefined ? undefined : [app]);
}
