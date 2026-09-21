# ADR: Shared boundary topology and authoritative village lights

Status: Accepted
Date: 2026-09-21

The previous town pass placed isolated strips and approximate elliptical turf edges, which cannot represent native corner constraints. Lamps were static artwork with unconditional emitters. Repeated hand-picked fixes would leave the same defects in future authored layouts.

Use pure family-specific neighbour rules and validated two-cell shelf masks, with native source crops. Keep these rules outside Studio so authoring and later editor tools can share them. Use persistent world_placeable state for permanent streetlamps and the existing object interaction/presentation pipeline. A single resolved lit value drives both sprite and illumination.

Alternatives: per-location corner patches are fragile; rotating horizontal perspective artwork distorts it; client-only lamp mode loses multiplayer persistence; a separate lamp table duplicates existing object lifecycle state. The chosen approach requires native atlas coverage checks, map-to-object synchronization and explicit invalid-topology diagnostics, but gives repeatable layouts and one authoritative light state.
