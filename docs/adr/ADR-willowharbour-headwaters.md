# ADR: bounded lamp intensity and complete native waterside scenery

Accepted for the Willowharbour follow-up.

A separate optional `intensityPerMille` expresses brightness without abusing flood propagation strength, which is capped to protect its integer bucket algorithm. Default 1000 preserves existing lights. Streetlamps use 3500. Intensity scales rendered falloff bands within the existing radius and preserves the authored hue at saturation; sprite state and authoritative mode are unchanged.

Use the original bridge arch columns and animated waterfall artwork, preserving native scale. Native arches are visual ground overlays below the collidable southern rail, not extra walkable terrain. The waterfall is an authored visual connection over the cliff between an upper freshwater lake and lower river.

Whole validated turf shelves are reserved before fences. Decorative planting cannot replace fence cells or occupy gateway approaches. This deterministic priority avoids placement-order-dependent broken boundaries.
