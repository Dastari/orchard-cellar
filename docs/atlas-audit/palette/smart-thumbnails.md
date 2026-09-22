# Smart palette thumbnails during an open menu

Smart terrain assets loaded successfully, but their initial gift glyphs could
remain visible while the Placement Mode popover was open. The shell deliberately
defers rebuilding tool controls while a popover is open, preserving the user's
menu. The old palette captured either an image or fallback when each row mounted,
so asset-ready invalidation alone could not replace that captured fallback.

Each mounted palette thumbnail now resolves its ready frame when painted. It
uses the existing UI-kit image painter and caches that painter until the source
image/frame changes. The gift glyph remains only while no preview is available.
This updates both Smart and Exact palette thumbnails without rebuilding rows,
closing the popover, resetting scroll position or changing placement mode.

The regression opens the actual placement popover, resolves deferred artwork,
and repaints the same retained thumbnail without a tool rebuild. It verifies
the native frame is drawn and the menu and Smart selection remain intact. The
terrain-authoring and full canvas-tool suites also pass. No source art, world
state or map document changes are part of this correction.
