# Willowharbour shallow relief and room envelopes

Status: Accepted
Date: 2026-09-21

The reference's turf banks are a few native pixels high, below one logical cliff
level. Use existing native shallow terrain decoration without increasing logical
elevation or drawing full stone walls. This preserves routes and actor projection;
the trade-off is visual microrelief rather than a new fractional elevation model.
Full elevation cliffs remain physical. River crossings remain physical water/deck
geometry and are checked separately.

Interior rooms use the content-owned union of room rectangles, separated by void
and joined with narrow hall rectangles. Render wall faces/caps from that same
walkable envelope, keeping collision and visual openings aligned. Decorative
partitions over one open rectangular floor would hide the intended room structure;
a new freeform wall schema is unnecessary for these fixed interiors.
