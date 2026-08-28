# Orchard & Cellar

Orchard & Cellar is a work-in-progress cooperative pixel-art farming and survival
game. Players restore an orchard, build a cellar, explore a persistent shared
overworld, and carry a family estate through successive generations.

The project uses TypeScript, HTML5 Canvas, a deterministic shared simulation, and
SpaceTimeDB as its realtime authority and durable store. The binding design and
engineering documentation starts at [`docs/00-overview.md`](docs/00-overview.md).

## Development

Install the JavaScript dependencies, install SpaceTimeDB 2.8, and run:

```sh
npm install
npm run check
npm run dev
```

Local databases, environment files, generated review output, and smoke-test tokens
are ignored. Licensed source sheets and design captures live in a local
`references/` directory which is deliberately excluded from this repository.

## Art credits and licensing

- The **Cute Fantasy** premium packs and **Cute Fantasy Free** are by
  **[Kenmi Art](https://kenmi-art.itch.io/)**. Orchard & Cellar uses reviewed and
  modified game assets under the applicable pack terms. The purchased source packs
  are not redistributed. Cute Fantasy Free is licensed for non-commercial use, so
  this project remains non-commercial while those derived assets are present.
- **Sprout Lands Basic** is by **Cup Nooble**. It was used as a style reference
  under its non-commercial terms; its source pack and pixels are not distributed
  here.
- Compact editor utility symbols use a reviewed subset of **[Lucide](https://lucide.dev/)**
  by the Lucide contributors under the ISC license. The vendored originals and
  license notice live together under `packages/client/public/ui/lucide/`.
- Game design, code, bespoke art, and synthesized audio are original to the
  Orchard & Cellar project.

See [`CREDITS.md`](CREDITS.md) for the project credit record. Public availability of
this source does not grant permission to extract or redistribute third-party art;
the applicable asset-pack terms remain in force. No project-wide open-source
license is currently granted.
