# Orchard canvas UI system

This directory is the migration target for in-game canvas UI. The component
lab uses it now; existing screens remain unchanged until the lab coverage is
approved.

## Frame rules

- A frame owns its chrome. Children only receive `uiFrameContentRect` or named
  rectangles from `layoutUiFrameSlots`.
- Insets are derived from authored sprite slices: wood `10`, parchment `8`,
  thin `6/6/6/7`, and wood + parchment `18`. Default component padding is
  added after the chrome inset. The heavy wood frame adds `8px` breathing room
  because its posts visually intrude farther than its 9-slice boundary.
- `book` starts from the authored `224×133` frame and exposes two proportional
  page rectangles. Scaled books preserve the original page faces and centre
  gutter; text content then adds asymmetric spine padding (more right padding
  on the left page and more left padding on the right page).
- Every closable frame uses the same compact danger `X` action for recognition
  and accessibility. `uiFrameControlLayout` changes only its chrome mount for
  wood, parchment, composite, thin, book, or unframed surfaces. A close control
  never consumes writable content.
- Controls belong only to top-level dismissible surfaces. Nested portrait,
  slot, master/detail, and decorative frames keep their hierarchy clear by
  omitting window controls.
- Book first/previous and next/last controls mount below the outer corners of
  the book. Page numbers remain inside the lower outer edge of each page, so
  navigation and numbering cannot overwrite one another.
- Slots, buttons, and text must never position themselves relative to a frame's
  outside rectangle.

## Layout rules

- `layoutUiFlex` and `layoutUiGrid` are the only general-purpose flow layouts.
  Both return the same pixel-snapped rectangles used for drawing and hit tests.
- Responsive composition uses `uiContainerVariant(frame.content.width)`, not
  the browser viewport. Compact, regular, and wide frames can therefore be
  tested side by side.
- Controls retain their authored minimum height. Labels truncate inside the
  control rather than overflowing into neighbours.

## Text rules

- Game text is always rendered through bitmap fonts.
- Every one-line label receives an explicit content rectangle. Use
  `layoutPixelTextInRect` when draw and hit geometry need the same measurement,
  or `drawPixelTextInRect` to measure, align, ellipsize, and hard-clip in one
  operation. Alignment is relative to the safe content face, never the frame
  chrome.
- `fitPixelText` measures authored bitmap glyphs rather than estimating by
  character count. On extremely narrow faces the suffix reduces from `...` to
  `..`, `.`, or an empty label so drawing never exceeds the contract.
- Ribbons expose three explicit overflow modes: `grow` expands the repeatable
  centre while preserving both end caps, `ellipsis` keeps a fixed maximum
  width, and `clip` hard-clips without a suffix. Stacked ribbons independently
  fit title and subtitle inside the vertical face and omit the subtitle when
  there is not enough height.
- Rich links are typed targets, never HTML: item, player, coordinate, page
  anchor, or allowlisted HTTP(S) URL.
- Supported markup is `[[item:apple|Apple]]`,
  `[[player:farmer-7|Mira]]`, and
  `[[coord:orchard,42,18|42, 18]]`. Page and URL equivalents are also
  available for legacy compact rich text.
- Wrapping, alignment, clipping, underlines, and hit regions all come from one
  `UiRichTextLayout`.

## Markdown-first content

`parseGameMarkdown` is the content boundary for books and future long-form
frames. It returns a renderer-neutral document model rather than HTML. Raw HTML
is displayed as ordinary text, and destinations such as `javascript:` never
become interactive targets.

Supported common syntax:

- `#`, `##`, and `###` headings, with optional `{#anchor}` identifiers
- paragraphs, soft line joins, strong text, emphasis, and inline code
- ordered and unordered lists, quotes, rules, and fenced code blocks
- `[label](https://...)` links restricted to HTTP(S)

Supported game syntax:

- `[Apple](item:apple)` and shorthand `[item:324234]`
- `[Mira](player:farmer-7)`
- `[Orchard](coord:orchard,42,18)`
- `[Recipes](page:recipes)` for an in-document jump
- `<!-- page -->` to force the next page and `<!-- page: 5 -->` to place the
  following content on a particular one-based page
- `<!-- bookmark: id | Label | green | right | optional-anchor -->` for
  gold/green/red/blue/purple tabs on either edge
- `<!-- embed: item | apple | Apple -->` for typed item, player, coordinate,
  chart, or custom embed hooks

Typed targets serialize back to stable `item:`, `player:`, `coord:`, `page:`,
or HTTP(S) destinations through `serializeUiTextLinkTarget`, so the same data
can be copied or shared and then revalidated by `parseUiTextLinkTarget`.

`layoutGameBook` wraps with real bitmap-glyph measurements and automatically
flows blocks across numbered pages. It also resolves headings, explicit page
breaks, bookmarks, links, and embed rectangles into one immutable pagination
result. The first physical page opens on the right; later spreads pair even and
odd pages. `drawGameBook` returns the exact control, bookmark, and link hit
geometry and accepts an allowlisted application embed renderer.

## Inventory rules

- UI slots render state; `@orchard/sim` remains the authority for acceptance,
  maximum stacks, metadata compatibility, pickup, split, merge, swap,
  shift-move, double-click collection, and quick-craft distribution.
- Left drag distributes evenly. Right drag places one per eligible slot.
- The authored selector has a transparent 48px canvas. Its visible corners are
  mapped at least `3px` outside the slot border. During quick-craft spread only
  the slot currently under the pointer receives a reticle; accumulated targets
  communicate their preview through their changed stack quantity.
- Restricted equipment cells call the same tag-based `slotAcceptsItem` rule as
  live containers.
- Cursor state is a real stack. A failed operation preserves it.

## Pixel-art scaling rules

- Every fixed sprite destination and every 9-slice boundary is snapped through
  the active canvas transform to physical device pixels. Adjacent patches share
  the exact snapped edge, preventing hairlines and detached corner fragments at
  fractional DPR or canvas zoom.
- Bitmap art still uses nearest-neighbour sampling. A fit-all view may discard
  source pixels when zoomed below one physical pixel per authored pixel; use
  the lab's `1:1` control for final pixel inspection.
