import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface AcceptanceEntry {
  source: string;
  readonly id: string;
  readonly sourceAnchors: readonly string[];
}

// Run after editing either plan. Exact semantic anchors fail closed if a
// paragraph was rewritten or duplicated and needs a fresh evidence review.
const repository = resolve(import.meta.dirname, '..');
const manifestPath = resolve(repository, 'scripts/docs-55-56-acceptance-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  readonly entries: readonly AcceptanceEntry[];
};
for (const entry of manifest.entries) {
  const document = entry.source.split(':')[0]!;
  if (!/^docs\/(?:55-game-authoring-suite|56-orchard-studio)\.md$/u.test(document)) {
    throw new Error(`Invalid acceptance document: ${entry.id}`);
  }
  const lines = readFileSync(resolve(repository, document), 'utf8').split('\n');
  if (entry.sourceAnchors.length === 0) throw new Error(`Missing acceptance anchors: ${entry.id}`);
  const references = entry.sourceAnchors.map((anchor) => {
    const matches = lines.flatMap((line, index) => line === anchor ? [index + 1] : []);
    if (anchor.trim().length <= 10 || matches.length !== 1) {
      throw new Error(`Acceptance anchor needs review: ${entry.id}: ${anchor}`);
    }
    return matches[0];
  });
  entry.source = `${document}:${references.join(',')}`;
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Recomputed source lines for ${manifest.entries.length} acceptance entries.\n`);
