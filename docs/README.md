# Documentation has moved to the wiki

**https://wiki.orchard.dastari.net/** is the home of Orchard & Cellar's design,
decisions, plans, runbooks and history. The numbered design docs, specs, handoffs,
audits, reviews, release records and ADRs that used to live here were migrated to the
wiki and removed from this repository on 2026-09-24.

**Rule:** design, decisions and plans live in the wiki. This `docs/` directory keeps
only files that tooling or tests read, write or byte-check.

## Wiki map

| Section | What is there |
|---|---|
| [Home](https://wiki.orchard.dastari.net/Home) · [Index](https://wiki.orchard.dastari.net/Index) · [Glossary](https://wiki.orchard.dastari.net/Glossary) | Start here |
| [Vision](https://wiki.orchard.dastari.net/Vision) | Pitch, pillars, tone, core loop |
| [Decisions](https://wiki.orchard.dastari.net/Decisions) | The decision register (every owner and ADR decision, with status) and the full [Decision Log](https://wiki.orchard.dastari.net/Decisions/Decision%20Log) |
| [Bugs](https://wiki.orchard.dastari.net/Bugs) | Known bugs, one page each, and the bug-fix run workflow |
| [Roadmap](https://wiki.orchard.dastari.net/Roadmap) | Current plans, [Owner Questions](https://wiki.orchard.dastari.net/Roadmap/Owner%20Questions), open pull requests |
| [Systems](https://wiki.orchard.dastari.net/Systems) | Gameplay systems: farming, orchard, cellar, crafting, combat, economy, audio… |
| [World](https://wiki.orchard.dastari.net/World) | Map and terrain, tiles and rules, chunks, spaces, regions, traversal |
| [Content](https://wiki.orchard.dastari.net/Content) | Items, recipes, objects, creatures, loot, the content registry |
| [Studio](https://wiki.orchard.dastari.net/Studio) | Cellar Studio tools, map editor, authoring suite, permissions, acceptance |
| [UI](https://wiki.orchard.dastari.net/UI) · [Art](https://wiki.orchard.dastari.net/Art) | UI kit and frames; style bible, asset pipeline, sprites, icons |
| [Architecture](https://wiki.orchard.dastari.net/Architecture) | Engine, sim, SpacetimeDB world, client, netcode, performance |
| [Operations](https://wiki.orchard.dastari.net/Operations) | Deploy and publish, backups, releases, Agent Mail, wiki publishing jobs |
| [Agents](https://wiki.orchard.dastari.net/Agents) | Agent workflow, skills and coordination |
| [History](https://wiki.orchard.dastari.net/History) | Summaries of retired plans, releases and incidents |

## Reading and editing

- **People:** open the wiki in a browser and sign in with your Orchard & Cellar game
  account (the `wiki-editor` role is required). Pages save as you type and are
  committed to the wiki's Git repository automatically.
- **Agents:** use the `orchard-wiki` MCP server (`search`, `read_page`, `list_pages`,
  `backlinks`, `write_page`, `list_attachments`), or clone the private wiki repository
  `Dastari/orchard-wiki` and edit `space/<Section>/<Page>.md` directly on `main`. See
  `AGENTS.md` ("Documentation lives in the wiki") for setup and conventions.

## What stays here

| Path | Why it stays |
|---|---|
| `action-baseline.md` | Written by `npm run actions:baseline -- --write`; byte-compared by `packages/tools/src/action-baseline.test.ts` |
| `agent-development-account.md` | Runbook for the dedicated agent account linked from `AGENTS.md` |
| `legacy-farm-retirement-finalizer.md` | Operator runbook for the retirement scripts; evidence path in `scripts/authoring-acceptance-manifest.json` |
| `atlas-audit/` | Output of `scripts/audit-atlas.ts` (`inventory/`), `scripts/render-terrain-catalogue.ts` (`terrain/`, drift-checked by `--check`) and the pavement/terrain importers (`palette/*.json`) |
| `food-alchemy/` | Plan data (`catalogue.json`, icon audit) read by `render.py` and `validate.py`, and their generated `tables.md` and `index.html` |
| `food-alchemy-p0/icon-imports.json` | Read by `packages/tools/src/import-food-alchemy-icons.ts` and its test |
| `reference-assets/` | Generated reference indexes (`npm run document:references -w @orchard/tools`), read by the atlas audit, terrain catalogue and `check:references` |

Do not add design docs, plans, handoffs, audits or release records here. Write them in
the wiki and link the page from your PR.
