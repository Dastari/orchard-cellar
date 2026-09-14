import { fileURLToPath } from 'node:url';
import { cp, mkdir } from 'node:fs/promises';
import { workspaceRoot } from './assets/load.js';

/** Canonical shared symbols retain the existing /ui/lucide URLs in both apps. */
export async function copyUiPublic(): Promise<void> {
  for (const app of ['client', 'studio']) {
    const target = new URL(`packages/${app}/public/ui/lucide/`, workspaceRoot);
    await mkdir(target, { recursive: true });
    await cp(new URL('packages/ui/public/ui/lucide/', workspaceRoot), target, { recursive: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await copyUiPublic();
