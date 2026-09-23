# Food & alchemy plan data and tooling

The approved food, alchemy, wildlife-collection and apiary plan (formerly doc 63) lives
in the wiki: [Roadmap/Food & Alchemy/Full Plan](https://wiki.orchard.dastari.net/Roadmap/Food%20%26%20Alchemy/Full%20Plan).
This directory keeps only the plan's machine-readable data and the tools that read or
write it. It is not runtime content; nothing here changes `packages/assets/content`.

## Files

- `catalogue.json`: 348 item rows, 283 transformation edges, 64 potion variants, icon
  provenance (paths, crops, SHA-256) and proposed values. Edit data here.
- `icon-audit.csv` and `icon-audit.json`: all 6,982 Kenmi vendor icons, one disposition each.
- `tables.md` (generated): the master item table and exact potion catalogue (plan §§12–13).
- `index.html` (generated): the searchable companion (items, alternatives, icon audit,
  dependency chains, owner decisions), with the catalogue embedded.
- `render.py`: regenerates `tables.md` and `index.html` from the JSON. Presentation,
  chains and decision summaries are edited in this script. Never hand-edit the outputs.
- `validate.py`: documentary integrity checks (IDs, references, potion shapes, graph
  depth, source hashes and crops, audit coordinates, HTML/table parity, shop→craft→sale
  bounds). It reads the licensed icon sheets, so it needs the local `references/` library.

## Regenerate and validate

From the repository root, with the licensed `references/` library available locally:

```sh
python3 docs/food-alchemy/render.py
python3 docs/food-alchemy/validate.py
```

Passing the validator is not gameplay validation or owner approval. After a change,
refresh the wiki copy of the companion (job 4 on the wiki page
[Operations/Wiki Publishing Jobs](https://wiki.orchard.dastari.net/Operations/Wiki%20Publishing%20Jobs)).

To view the companion locally, run `python3 -m http.server 8937 --bind 127.0.0.1` from
the repository root and open `http://127.0.0.1:8937/docs/food-alchemy/`. Icons load
from the local licensed library; without it, previews show "Local art unavailable".
