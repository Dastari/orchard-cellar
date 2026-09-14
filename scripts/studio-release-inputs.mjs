import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

const [root, output] = process.argv.slice(2);
if (!root || !output) throw new Error('studio_source_manifest_arguments');
const files = {};
async function visit(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`studio_source_symlink:${relative(root, path)}`);
  if (stat.isDirectory()) {
    for (const name of (await readdir(path)).sort()) {
      if (name === 'node_modules' || name === 'dist') continue;
      await visit(join(path, name));
    }
  } else if (stat.isFile()) {
    files[relative(root, path)] = createHash('sha256').update(await readFile(path)).digest('hex');
  } else throw new Error('studio_source_special_file');
}
for (const path of ['package.json', 'package-lock.json', 'tsconfig.base.json', 'packages', 'scripts', 'ui', 'ops']) {
  await visit(join(root, path));
}
await writeFile(output, `${JSON.stringify(files, null, 2)}\n`, { mode: 0o600 });
