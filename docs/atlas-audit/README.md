# Atlas audit outputs

Generated evidence only. The audit's method, findings, corrections and known aliases
are on the wiki page [Art/Asset Pipeline](https://wiki.orchard.dastari.net/Art/Asset%20Pipeline)
(Atlas audit), and the terrain joining guide is embedded on
[World/Tiles & Rules](https://wiki.orchard.dastari.net/World/Tiles%20%26%20Rules).

| Path | Written by | Notes |
|---|---|---|
| `terrain/` (`index.html`, `README.md`, `catalogue.json`, `artifact-manifest.json`, `rules/`, `assets/`) | `npx tsx scripts/render-terrain-catalogue.ts` | Drift gate: `--check`. Start with [the terrain guide](terrain/index.html) |
| `inventory/` (`README.md`, `inventory.json`, `frames.jsonl.gz`, `duplicate-evidence.html`) | `npx tsx scripts/audit-atlas.ts --source-root /path/to/references` | Needs `npm run assets:build` first |
| `palette/pavement-source-coverage.json` | `npx tsx packages/tools/src/import-pavement-variants.ts` | Hearth pavement source-cell ledger |
| `palette/repaired-source-coverage.json` | `npx tsx packages/tools/src/import-empty-terrain.ts` | Desert grass and interior wall repair ledger |

Regenerate, never hand-edit. The licensed source corpus stays local (`references/`);
refresh the wiki copies afterwards (wiki page
[Operations/Wiki Publishing Jobs](https://wiki.orchard.dastari.net/Operations/Wiki%20Publishing%20Jobs), jobs 1 and 2).
