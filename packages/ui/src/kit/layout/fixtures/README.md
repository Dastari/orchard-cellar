# Layout fixture provenance

`cases.json` contains the same dimensions, spacing and sizing choices as its CSS
markup. `browser-rects.json` freezes `getBoundingClientRect()` results from
Chromium 152 through Playwright (2026-09-05). Tests compare the arranged kit rects
against those browser results, not against a second copy of the kit algorithm.

Reproduce each case by creating a border-box div of `size`, applying `css`, and
inserting the `children` with their individual `css`. Body margin is zero. Capture
the child bounding rectangles in order. Pixel-boundary ties use integer edge
rounding; all current browser reference cases have integral edges.

Deliberate inherited differences from general CSS:

- Percent flex dimensions use the space remaining **after requested gaps**, as
  documented by `UiAxisSizing`. CSS percentages use the entire content axis.
- Auto grids collapse empty tracks and use uniform natural row height. Explicit
  columns retain empty tracks; named areas must be rectangular.
- Fixed sizing never shrinks; use fit/grow with min/max for shrinkable controls.
- Nodes default to zero automatic minimum; explicit min sizes preserve content.
- Wrapped flex lines use natural cross sizes (CSS `align-content: flex-start`).
- Floats, baseline alignment, implicit named-grid placement, and CSS text metrics
  are outside this pixel UI contract. Text measurement hooks use bitmap metrics.

`runtime.html` is a standalone browser fixture served by Vite. Tab/Enter and a
pointer click activate its two retained controls. Idle paint counts stop changing;
reduced-motion changes update the root; disposal disconnects all input handlers.
It changes neither application's rendering.
