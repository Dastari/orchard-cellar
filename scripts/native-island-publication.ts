/** v1.0.0 — Prepare the normal atomic map/chunk payload offline; never uploads. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { materializeLiveMapPublication } from "../packages/studio/src/world-chunks/publication-materialize.js";
import type { ContentDefinitionRow } from "../packages/sim/src/index.js";
const output = resolve(
  process.argv[2] ?? "output/island-world-update-20261002",
);
const state = JSON.parse(
  await readFile(resolve(output, "live-state.json"), "utf8"),
) as {
  mapRow: { revision: number; contentHash: string; documentJson: string };
  contentHead: { contentHash: string };
  contentRows: ContentDefinitionRow[];
};
const publication = materializeLiveMapPublication(
  {
    head: state.mapRow,
    deltaJson: await readFile(resolve(output, "candidate-delta.json"), "utf8"),
    expectedRevision: state.mapRow.revision,
    clientMutationId: `native-islands-r${state.mapRow.revision}`,
    contentRows: state.contentRows,
    atlasIndexSource: await readFile(
      resolve(
        import.meta.dirname,
        "../packages/assets/generated/atlas.packs.json",
      ),
      "utf8",
    ),
  },
  (phase) => console.log(phase),
);
if (publication.registryContentHash !== state.contentHead.contentHash)
  throw Error("native_island_content_pin_mismatch");
const chunks = resolve(output, "verified-chunks");
await mkdir(chunks, { recursive: true });
for (const blob of publication.blobs)
  await writeFile(resolve(chunks, `${blob.contentHash}.json`), blob.bytes);
await writeFile(
  resolve(output, "candidate-manifest.json"),
  publication.manifestJson,
);
await writeFile(
  resolve(output, "predicted-map-head.json"),
  JSON.stringify(publication.row),
);
const report = {
  preparedOnly: true,
  baseRevision: state.mapRow.revision,
  baseHash: state.mapRow.contentHash,
  predictedRevision: publication.row.revision,
  predictedHash: publication.row.contentHash,
  registryContentHash: publication.registryContentHash,
  chunks: publication.blobs.length,
  blobBytes: publication.blobs.reduce((n, b) => n + b.bytes.length, 0),
  maximumBlobBytes: Math.max(...publication.blobs.map((b) => b.bytes.length)),
};
await writeFile(
  resolve(output, "publication-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
